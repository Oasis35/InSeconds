using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

/// <param name="Label">Navigateur et système (« Chrome · Android »), vide s'ils n'ont pas été reconnus.</param>
/// <param name="IsCurrent">L'appareil de cette requête.</param>
public sealed record DeviceResponse(int Id, string? Label, DateTimeOffset CreatedAt, DateTimeOffset LastSeenAt, bool IsCurrent);

public sealed record RevokedDevicesResponse(int Revoked);

/// <summary>
/// Révocation côté serveur (§ 5.5) : la session est marquée révoquée et retirée du cache de validation,
/// son cookie est refusé dès la requête suivante, sur l'appareil concerné seulement (piège 39).
/// </summary>
internal static class DeviceRevocation
{
    public static void Revoke(DeviceSession session, IDeviceSessionValidationCache validationCache, DateTimeOffset now)
    {
        session.Revoke(now);
        validationCache.Forget(session.PlayerId, session.Id);
    }
}

public static class LogoutEndpoint
{
    /// <summary>
    /// <c>POST /api/players/auth/logout</c> : révoque l'appareil courant et retire son cookie. Les
    /// autres appareils du compte restent connectés (piège 39). Sans cookie : 204 aussi.
    /// </summary>
    [WolverinePost("/api/players/auth/logout", OperationId = "logout")]
    [EmptyResponse]
    public static async Task Post(
        ICurrentPlayer current,
        IPlayerStore store,
        IPlayerSignIn signIn,
        IDeviceSessionValidationCache validationCache,
        TimeProvider time,
        CancellationToken ct)
    {
        if (current is { PlayerId: { } playerId, DeviceSessionId: { } sessionId }
            && await store.FindDeviceSessionAsync(sessionId, ct) is { } session
            && session.PlayerId == playerId)
            DeviceRevocation.Revoke(session, validationCache, time.GetUtcNow());

        await signIn.SignOutAsync();
    }
}

public static class ListDevicesEndpoint
{
    /// <summary><c>GET /api/players/me/devices</c> : les appareils encore connectés, le plus récemment vu d'abord.</summary>
    [Authorize]
    [WolverineGet("/api/players/me/devices", OperationId = "listDevices")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public static Task<IReadOnlyList<DeviceResponse>> Get(ICurrentPlayer current, IPlayerQueries queries, CancellationToken ct) =>
        queries.ListDevicesAsync(current.PlayerId!.Value, current.DeviceSessionId, ct);
}

public static class RevokeDeviceEndpoint
{
    public static async Task<DeviceSession?> LoadAsync(int id, ICurrentPlayer current, IPlayerStore store, CancellationToken ct) =>
        await store.FindDeviceSessionAsync(id, ct) is { RevokedAt: null } session && session.PlayerId == current.PlayerId
            ? session
            : null;

    // L'appareil d'un autre joueur répond comme un appareil inconnu : rien n'en est révélé.
    public static ProblemDetails Validate(DeviceSession? session) =>
        session is null ? PlayersProblems.DeviceNotFound() : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>DELETE /api/players/me/devices/{id}</c> : déconnecte un de ses appareils. Celui de la requête :
    /// comme une déconnexion, cookie retiré. Limité par joueur (S11).
    /// </summary>
    [Authorize]
    [WolverineDelete("/api/players/me/devices/{id}", OperationId = "revokeDevice")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    [EnableRateLimiting(RateLimitPolicies.DeviceRevocation)]
    [EmptyResponse]
    public static async Task Delete(
        int id,
        // Chargée par LoadAsync : pas le corps de la requête (un DELETE n'en a pas).
        [NotBody] DeviceSession session,
        ICurrentPlayer current,
        IPlayerSignIn signIn,
        IDeviceSessionValidationCache validationCache,
        TimeProvider time)
    {
        DeviceRevocation.Revoke(session, validationCache, time.GetUtcNow());
        if (id == current.DeviceSessionId)
            await signIn.SignOutAsync();
    }
}

public static class RevokeOtherDevicesEndpoint
{
    /// <summary>
    /// <c>POST /api/players/me/devices/revoke-others</c> : « déconnecter les autres appareils », tous sauf
    /// celui de la requête. Les appareils qui ont encore un cookie v1 non converti en font partie : le
    /// jeton v1 du joueur est supprimé (S6), l'appareil courant a déjà son cookie v2. Limité par joueur (S11).
    /// </summary>
    [Authorize]
    [WolverinePost("/api/players/me/devices/revoke-others", OperationId = "revokeOtherDevices")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    [EnableRateLimiting(RateLimitPolicies.DeviceRevocation)]
    public static async Task<RevokedDevicesResponse> Post(
        ICurrentPlayer current,
        IPlayerStore store,
        IDeviceSessionValidationCache validationCache,
        TimeProvider time,
        CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var others = (await store.FindActiveDeviceSessionsAsync(current.PlayerId!.Value, ct))
            .Where(s => s.Id != current.DeviceSessionId)
            .ToList();
        foreach (var session in others)
            DeviceRevocation.Revoke(session, validationCache, now);
        await store.DeleteLegacyTokenAsync(current.PlayerId!.Value, ct);
        return new RevokedDevicesResponse(others.Count);
    }
}

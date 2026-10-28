using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using InSeconds.Infrastructure.Http;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

public sealed record GuestResponse(Guid PlayerId);

/// <summary>
/// Le corps, optionnel, de <c>POST /api/players/guest</c>.
/// </summary>
/// <param name="Source">D'où vient le joueur (<c>utm_source</c> de son lien, ou domaine du site d'où il arrive), nettoyée par
/// <see cref="AcquisitionSource"/> : une valeur mal formée devient <c>other</c>, jamais une erreur.</param>
public sealed record CreateGuest(string? Source);

public static class CreateGuestEndpoint
{
    /// <summary>
    /// <c>POST /api/players/guest</c> : une identité d'invité pour ce navigateur (§ 5.5 du plan v2),
    /// par une commande explicite, jamais par un GET. Un navigateur déjà identifié garde son joueur.
    /// Limité par IP, comme toute création de joueur (S11). La source d'arrivée n'est notée qu'à la création (un joueur déjà identifié
    /// garde la sienne) ; le corps est optionnel, une source absente vaut <c>direct</c>.
    /// </summary>
    [WolverinePost("/api/players/guest", OperationId = "createGuest")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    [EnableRateLimiting(RateLimitPolicies.PlayerCreation)]
    public static async Task<GuestResponse> Post(
        CreateGuest? request, HttpContext context, ICurrentPlayer current, IPlayerStore store, IPlayerSignIn signIn, PlayersMetrics metrics,
        TimeProvider time, CancellationToken ct)
    {
        if (current.PlayerId is { } existing)
            return new GuestResponse(existing);

        var now = time.GetUtcNow();
        var source = AcquisitionSource.Normalize(request?.Source);
        var player = Player.CreateGuest(Guid.NewGuid(), now, source);
        var session = DeviceSession.Open(player.Id, now, DeviceLabel.From(context.Request.Headers.UserAgent));
        store.Add(player);
        await store.AddAsync(session, ct);
        // Le cookie part avec la réponse, après l'enregistrement de la transaction par Wolverine : si
        // l'enregistrement échoue, la réponse est une 500 sans cookie.
        await signIn.SignInAsync(player.Id, session.Id, isAdmin: false);
        metrics.GuestCreated(source);
        return new GuestResponse(player.Id);
    }
}

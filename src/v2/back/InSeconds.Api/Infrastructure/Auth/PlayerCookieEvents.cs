using System.Security.Claims;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Caching.Memory;

namespace InSeconds.Api.Infrastructure.Auth;

/// <summary>Événements du cookie : validation de l'appareil à chaque requête, 401/403 au lieu de redirections.</summary>
internal sealed class PlayerCookieEvents(DeviceSessionValidator validator) : CookieAuthenticationEvents
{
    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        // Une erreur de base remonte (500) : seul un appareil réellement invalide est rejeté (piège 37).
        var principal = await validator.ValidateAsync(context.Principal, context.HttpContext.RequestAborted);
        if (principal is null)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(context.Scheme.Name);
            return;
        }

        context.ReplacePrincipal(principal);
    }

    // Une API répond 401/403, jamais une redirection HTML vers une page de connexion.
    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    }

    public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    }
}

/// <summary>
/// Vérifie qu'un cookie désigne toujours un appareil actif (§ 5.5 du plan v2) : appareil existant,
/// non révoqué, joueur non supprimé ; le rôle admin est relu en base. Le résultat est gardé une
/// minute : une révocation ou un retrait du rôle s'appliquent en moins d'une minute. La dernière
/// visite (appareil et joueur) est notée au plus toutes les 5 minutes (R17).
/// </summary>
internal sealed class DeviceSessionValidator(IPlayerSessions sessions, DeviceSessionStatusCache cache, TimeProvider time)
{
    public static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(1);
    public static readonly TimeSpan LastSeenInterval = TimeSpan.FromMinutes(5);

    /// <summary>Le joueur à retenir pour la requête, ou <c>null</c> si le cookie doit être rejeté.</summary>
    public async Task<ClaimsPrincipal?> ValidateAsync(ClaimsPrincipal? principal, CancellationToken ct)
    {
        if (!PlayerClaims.TryRead(principal, out var playerId, out var deviceSessionId))
            return null;

        var now = time.GetUtcNow();
        if (cache.Get(playerId, deviceSessionId) is not { } cached || now - cached.CheckedAt >= CacheDuration)
        {
            cached = new CachedStatus(await sessions.GetStatusAsync(playerId, deviceSessionId, ct), now);
            cache.Set(playerId, deviceSessionId, cached);
        }

        if (!cached.Status.IsActive)
            return null;

        if (now - cached.Status.LastSeenAt >= LastSeenInterval)
        {
            await sessions.RecordSeenAsync(playerId, deviceSessionId, now, ct);
            cache.Set(playerId, deviceSessionId, cached with { Status = cached.Status with { LastSeenAt = now } });
        }

        return PlayerClaims.Create(playerId, deviceSessionId, cached.Status.IsAdmin);
    }
}

internal sealed record CachedStatus(DeviceSessionStatus Status, DateTimeOffset CheckedAt);

/// <summary>
/// Cache des validations d'appareil, à part du cache mémoire partagé : une limite de taille y oblige
/// chaque entrée à déclarer sa taille (piège 24), ce qu'une bibliothèque tierce ne ferait pas. La
/// fraîcheur se juge sur <see cref="TimeProvider"/> (testable) ; l'expiration ne sert qu'au ménage.
/// </summary>
internal sealed class DeviceSessionStatusCache : IDisposable
{
    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = 10_000 });

    public CachedStatus? Get(Guid playerId, int deviceSessionId) =>
        _cache.TryGetValue(Key(playerId, deviceSessionId), out CachedStatus? cached) ? cached : null;

    public void Set(Guid playerId, int deviceSessionId, CachedStatus status) =>
        _cache.Set(Key(playerId, deviceSessionId), status, new MemoryCacheEntryOptions
        {
            Size = 1,
            AbsoluteExpirationRelativeToNow = DeviceSessionValidator.CacheDuration * 2,
        });

    public void Dispose() => _cache.Dispose();

    private static string Key(Guid playerId, int deviceSessionId) => $"{playerId:N}:{deviceSessionId}";
}

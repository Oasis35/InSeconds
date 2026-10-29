using System.Security.Claims;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Caching.Memory;

namespace InSeconds.Api.Modules.Players.Auth;

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
/// Vérifie qu'un cookie désigne toujours un appareil actif : appareil existant,
/// non révoqué, joueur non supprimé ; le rôle admin est relu en base. Le résultat est gardé une
/// minute : une révocation ou un retrait du rôle s'appliquent en moins d'une minute. La dernière
/// visite (appareil et joueur) est notée au plus toutes les 5 minutes : une écriture par requête
/// chargerait la base pour rien.
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
        // Une révocation survenue pendant cette validation rend l'état lu douteux : il sert à cette requête, pas aux suivantes.
        var generation = cache.Generation;
        if (cache.Get(playerId, deviceSessionId) is not { } cached || now - cached.CheckedAt >= CacheDuration)
        {
            cached = new CachedStatus(await sessions.GetStatusAsync(playerId, deviceSessionId, ct), now);
            cache.TrySet(playerId, deviceSessionId, cached, generation);
        }

        if (!cached.Status.IsActive)
            return null;

        if (now - cached.Status.LastSeenAt >= LastSeenInterval)
        {
            await sessions.RecordSeenAsync(playerId, deviceSessionId, now, ct);
            cache.TrySet(playerId, deviceSessionId, cached with { Status = cached.Status with { LastSeenAt = now } }, generation);
        }

        return PlayerClaims.Create(playerId, deviceSessionId, cached.Status.IsAdmin);
    }
}

internal sealed record CachedStatus(DeviceSessionStatus Status, DateTimeOffset CheckedAt);

/// <summary>
/// Oublie la validation gardée en cache d'une session qu'on vient de révoquer : elle est refusée dès
/// la requête suivante, sans attendre la minute de cache (S5, l'ancienne session d'un navigateur
/// qui se connecte).
/// </summary>
public interface IDeviceSessionValidationCache
{
    /// <summary>
    /// Retire la session du cache tout de suite, puis une seconde fois au démarrage de la réponse, donc après le
    /// commit de la transaction de Wolverine (il précède l'écriture de la réponse) : une requête concurrente qui a lu
    /// la session encore active avant le commit ne peut pas la remettre en cache (#319). Hors requête HTTP, retirée
    /// tout de suite seulement.
    /// </summary>
    void Forget(Guid playerId, int deviceSessionId);
}

/// <summary>
/// Cache des validations d'appareil, à part du cache mémoire partagé : une limite de taille y oblige
/// chaque entrée à déclarer sa taille (piège 24), ce qu'une bibliothèque tierce ne ferait pas. La
/// fraîcheur se juge sur <see cref="TimeProvider"/> (testable) ; l'expiration ne sert qu'au ménage.
/// </summary>
/// <remarks>
/// <see cref="Generation"/> compte les oublis : un état lu en base n'est gardé que si aucun oubli n'a eu lieu
/// depuis le début de sa lecture (<see cref="TrySet"/>). Les révocations sont rares : au pire, une lecture de plus.
/// </remarks>
internal sealed class DeviceSessionStatusCache(IHttpContextAccessor httpContextAccessor) : IDeviceSessionValidationCache, IDisposable
{
    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = 10_000 });
    private readonly Lock _lock = new();
    private long _generation;

    public long Generation => Interlocked.Read(ref _generation);

    public CachedStatus? Get(Guid playerId, int deviceSessionId) =>
        _cache.TryGetValue(Key(playerId, deviceSessionId), out CachedStatus? cached) ? cached : null;

    /// <summary>Garde l'état, sauf si une session a été oubliée depuis <paramref name="generation"/> (lu avant la lecture en base).</summary>
    public bool TrySet(Guid playerId, int deviceSessionId, CachedStatus status, long generation)
    {
        lock (_lock)
        {
            if (_generation != generation)
                return false;
            _cache.Set(Key(playerId, deviceSessionId), status, new MemoryCacheEntryOptions
            {
                Size = 1,
                AbsoluteExpirationRelativeToNow = DeviceSessionValidator.CacheDuration * 2,
            });
            return true;
        }
    }

    public void Forget(Guid playerId, int deviceSessionId)
    {
        Remove(playerId, deviceSessionId);
        if (httpContextAccessor.HttpContext?.Response is { HasStarted: false } response)
            response.OnStarting(() =>
            {
                Remove(playerId, deviceSessionId);
                return Task.CompletedTask;
            });
    }

    public void Dispose() => _cache.Dispose();

    private void Remove(Guid playerId, int deviceSessionId)
    {
        lock (_lock)
        {
            _generation++;
            _cache.Remove(Key(playerId, deviceSessionId));
        }
    }

    private static string Key(Guid playerId, int deviceSessionId) => $"{playerId:N}:{deviceSessionId}";
}

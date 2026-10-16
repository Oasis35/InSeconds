using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.Extensions.Caching.Memory;

namespace InSeconds.Api.Infrastructure.Auth;

/// <summary>
/// Conversions récentes de cookies v1 : pendant une minute, un même jeton v1 retrouve la session
/// d'appareil qu'il vient d'ouvrir au lieu d'en créer une autre. Au premier chargement, le front
/// envoie plusieurs requêtes en parallèle avec le même cookie v1 : sans ça, un seul navigateur
/// obtiendrait plusieurs sessions, et un cookie v1 rejoué en boucle remplirait la table. Deux
/// appareils du même compte convertis dans la même minute partagent leur session (rare, sans danger).
/// Les conversions d'un même jeton sont faites l'une après l'autre (verrous répartis par jeton).
/// Même principe que <see cref="DeviceSessionStatusCache"/> : cache à part (piège 24), fraîcheur
/// jugée sur <see cref="TimeProvider"/>.
/// </summary>
internal sealed class LegacyConversionCache(TimeProvider time) : IDisposable
{
    public static readonly TimeSpan ReuseDuration = TimeSpan.FromMinutes(1);

    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = 10_000 });
    private readonly SemaphoreSlim[] _locks = Enumerable.Range(0, 32).Select(_ => new SemaphoreSlim(1, 1)).ToArray();

    /// <summary>
    /// La session ouverte pour ce jeton depuis moins d'une minute, sinon celle que renvoie
    /// <paramref name="open"/>. Un jeton inconnu (<c>null</c>) et une erreur ne sont pas retenus.
    /// </summary>
    public async Task<OpenedDeviceSession?> GetOrOpenAsync(
        Guid legacyAuthToken, Func<Task<OpenedDeviceSession?>> open, CancellationToken ct)
    {
        var gate = _locks[(legacyAuthToken.GetHashCode() & int.MaxValue) % _locks.Length];
        await gate.WaitAsync(ct);
        try
        {
            if (_cache.TryGetValue(legacyAuthToken, out Conversion? recent)
                && time.GetUtcNow() - recent!.OpenedAt < ReuseDuration)
                return recent.Session;

            var opened = await open();
            if (opened is not null)
                _cache.Set(legacyAuthToken, new Conversion(opened, time.GetUtcNow()), new MemoryCacheEntryOptions
                {
                    Size = 1,
                    AbsoluteExpirationRelativeToNow = ReuseDuration * 2,
                });
            return opened;
        }
        finally
        {
            gate.Release();
        }
    }

    public void Dispose()
    {
        _cache.Dispose();
        foreach (var gate in _locks)
            gate.Dispose();
    }

    private sealed record Conversion(OpenedDeviceSession Session, DateTimeOffset OpenedAt);
}

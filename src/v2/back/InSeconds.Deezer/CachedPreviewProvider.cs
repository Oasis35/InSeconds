using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace InSeconds.Deezer;

/// <summary>
/// Cache des extraits, partagés entre tous les joueurs d'un défi. Décorateur de <see cref="IPreviewProvider"/> :
/// à n'utiliser que là où l'URL suffit (le jeu), jamais pour connaître l'état réel d'un morceau (admin,
/// contrôle des extraits). Les URL de preview sont signées et expirent (piège 14) : le cache n'en garde
/// jamais une au-delà de sa signature.
/// </summary>
public sealed partial class CachedPreviewProvider(IPreviewProvider inner, IMemoryCache cache, TimeProvider time) : IPreviewProvider
{
    internal static readonly TimeSpan MaxTtl = TimeSpan.FromHours(24);

    /// <summary>
    /// Marge retranchée à l'expiration de la signature : couvre le délai entre le moment où le front reçoit
    /// l'URL et la lecture effective.
    /// </summary>
    internal static readonly TimeSpan SignatureSafetyMargin = TimeSpan.FromHours(1);

    // Les URL de preview Deezer sont signées : ...mp3?hdnea=exp=<unix>~acl=...~hmac=...
    [GeneratedRegex(@"[?&~=]exp=(\d+)")]
    private static partial Regex SignatureExpiryPattern();

    public async Task<PreviewLookup> GetPreviewAsync(long deezerTrackId, CancellationToken ct = default)
    {
        var key = $"deezer:preview:{deezerTrackId}";
        if (cache.TryGetValue(key, out PreviewLookup.Found? cached) && cached is not null)
            return cached;

        var lookup = await inner.GetPreviewAsync(deezerTrackId, ct);

        // Jamais une preview absente ni un échec : une panne Deezer passagère ne doit pas priver tous les
        // joueurs du morceau pendant 24 h.
        if (lookup is PreviewLookup.Found found)
        {
            var ttl = ComputeTtl(found.Url, time.GetUtcNow());
            if (ttl > TimeSpan.Zero)
                // Priorité haute : le cache est partagé avec les recherches publiques, qu'un script peut multiplier ;
                // ce sont elles qui doivent partir d'abord quand le cache est plein, pas les extraits du défi.
                cache.Set(key, found, new MemoryCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = ttl,
                    Size = 1,
                    Priority = CacheItemPriority.High,
                });
        }

        return lookup;
    }

    /// <summary>
    /// Durée de cache bornée par l'expiration de la signature de l'URL (moins la marge) : servir une URL
    /// signée expirée donne un 403 du CDN à la lecture. Nulle ou négative : ne pas mettre en cache.
    /// </summary>
    internal static TimeSpan ComputeTtl(string previewUrl, DateTimeOffset now)
    {
        var match = SignatureExpiryPattern().Match(previewUrl);
        if (!match.Success || !long.TryParse(match.Groups[1].Value, out var expUnix))
            return MaxTtl;

        var remaining = DateTimeOffset.FromUnixTimeSeconds(expUnix) - now - SignatureSafetyMargin;
        return remaining < MaxTtl ? remaining : MaxTtl;
    }
}

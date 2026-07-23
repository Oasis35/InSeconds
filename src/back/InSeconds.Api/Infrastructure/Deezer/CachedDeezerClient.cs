using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace InSeconds.Api.Infrastructure.Deezer;

/// <summary>
/// Cache mémoire devant <see cref="DeezerClient"/> pour les données partagées entre joueurs
/// (preview URLs du défi du jour, autocomplete public). Ne pas utiliser côté admin ni dans
/// <c>PreviewStatusRefresher</c> : ces appelants ont besoin de l'état Deezer réel.
/// </summary>
public sealed partial class CachedDeezerClient(DeezerClient deezer, IMemoryCache cache)
{
    private static readonly TimeSpan PreviewTtl = TimeSpan.FromHours(24);
    private static readonly TimeSpan SearchTtl = TimeSpan.FromHours(1);

    /// <summary>
    /// Marge retranchée à l'expiration de la signature Deezer : couvre le délai entre
    /// le moment où le front reçoit l'URL (StartSession) et la lecture effective.
    /// </summary>
    private static readonly TimeSpan SignatureSafetyMargin = TimeSpan.FromHours(1);

    // Les preview URLs Deezer sont signées : ...mp3?hdnea=exp=<unix>~acl=...~hmac=...
    [GeneratedRegex(@"[?&~=]exp=(\d+)")]
    private static partial Regex SignatureExpiryPattern();

    public async Task<string?> GetPreviewUrlAsync(long deezerTrackId, CancellationToken ct = default)
    {
        var key = $"deezer:preview:{deezerTrackId}";
        if (cache.TryGetValue(key, out string? cached))
            return cached;

        var preview = await deezer.GetPreviewUrlAsync(deezerTrackId, ct);

        // Ne jamais cacher une preview absente : un échec Deezer transitoire ne doit pas
        // priver tous les joueurs du morceau pendant 24h.
        if (!string.IsNullOrEmpty(preview))
        {
            var ttl = ComputeTtl(preview);
            if (ttl > TimeSpan.Zero)
                cache.Set(key, preview, ttl);
        }

        return preview;
    }

    /// <summary>
    /// TTL borné par l'expiration de la signature de l'URL (moins la marge de sécurité) :
    /// servir une URL signée expirée provoque un 403 CDN à la lecture côté joueur.
    /// TTL nul ou négatif = ne pas cacher (chaque appel repartira chercher une URL fraîche).
    /// </summary>
    private static TimeSpan ComputeTtl(string previewUrl)
    {
        var match = SignatureExpiryPattern().Match(previewUrl);
        if (!match.Success || !long.TryParse(match.Groups[1].Value, out var expUnix))
            return PreviewTtl;

        var remaining = DateTimeOffset.FromUnixTimeSeconds(expUnix) - DateTimeOffset.UtcNow - SignatureSafetyMargin;
        return remaining < PreviewTtl ? remaining : PreviewTtl;
    }

    public async Task<IReadOnlyList<DeezerTrackInfo>> SearchTracksAsync(string query, CancellationToken ct = default, int limit = 10)
    {
        var key = $"deezer:search:{limit}:{query.Trim().ToLowerInvariant()}";
        if (cache.TryGetValue(key, out IReadOnlyList<DeezerTrackInfo>? cached))
            return cached!;

        var results = await deezer.SearchTracksAsync(query, ct, limit);

        // Une liste vide peut être un échec réseau (DeezerClient renvoie [] dans les deux cas) :
        // on ne cache que les résultats non vides.
        if (results.Count > 0)
            cache.Set(key, results, SearchTtl);

        return results;
    }
}

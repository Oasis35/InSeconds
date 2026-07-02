using Microsoft.Extensions.Caching.Memory;

namespace InSeconds.Api.Infrastructure.Deezer;

/// <summary>
/// Cache mémoire devant <see cref="DeezerClient"/> pour les données partagées entre joueurs
/// (preview URLs du défi du jour, autocomplete public). Ne pas utiliser côté admin ni dans
/// <c>PreviewStatusRefresher</c> : ces appelants ont besoin de l'état Deezer réel.
/// </summary>
public sealed class CachedDeezerClient(DeezerClient deezer, IMemoryCache cache)
{
    private static readonly TimeSpan PreviewTtl = TimeSpan.FromHours(24);
    private static readonly TimeSpan SearchTtl = TimeSpan.FromHours(1);

    public async Task<string?> GetPreviewUrlAsync(long deezerTrackId, CancellationToken ct = default)
    {
        var key = $"deezer:preview:{deezerTrackId}";
        if (cache.TryGetValue(key, out string? cached))
            return cached;

        var preview = await deezer.GetPreviewUrlAsync(deezerTrackId, ct);

        // Ne jamais cacher une preview absente : un échec Deezer transitoire ne doit pas
        // priver tous les joueurs du morceau pendant 24h.
        if (!string.IsNullOrEmpty(preview))
            cache.Set(key, preview, PreviewTtl);

        return preview;
    }

    public async Task<IReadOnlyList<DeezerTrackInfo>> SearchTracksAsync(string query, CancellationToken ct = default)
    {
        var key = $"deezer:search:{query.Trim().ToLowerInvariant()}";
        if (cache.TryGetValue(key, out IReadOnlyList<DeezerTrackInfo>? cached))
            return cached!;

        var results = await deezer.SearchTracksAsync(query, ct);

        // Une liste vide peut être un échec réseau (DeezerClient renvoie [] dans les deux cas) :
        // on ne cache que les résultats non vides.
        if (results.Count > 0)
            cache.Set(key, results, SearchTtl);

        return results;
    }
}

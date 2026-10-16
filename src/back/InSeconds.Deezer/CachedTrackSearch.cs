using Microsoft.Extensions.Caching.Memory;

namespace InSeconds.Deezer;

/// <summary>
/// Cache de la recherche publique (autocomplétion du jeu) : une même saisie répétée par plusieurs joueurs
/// ne coûte qu'une requête à Deezer, dont le quota est partagé. Décorateur de <see cref="ITrackSearch"/> ;
/// la recherche admin passe par le port brut.
/// </summary>
public sealed class CachedTrackSearch(ITrackSearch inner, IMemoryCache cache) : ITrackSearch
{
    internal static readonly TimeSpan Ttl = TimeSpan.FromHours(1);

    public async Task<SearchLookup> SearchAsync(string query, int limit, CancellationToken ct = default)
    {
        var key = $"deezer:search:{limit}:{query.Trim().ToLowerInvariant()}";
        if (cache.TryGetValue(key, out SearchLookup.Found? cached) && cached is not null)
            return cached;

        var lookup = await inner.SearchAsync(query, limit, ct);

        // Jamais un échec, ni une recherche sans résultat : un catalogue qui s'enrichit, ou un incident chez
        // Deezer qui renverrait une liste vide en 200, ne doit pas figer « aucun résultat » pendant une heure.
        if (lookup is SearchLookup.Found { Tracks.Count: > 0 } found)
            cache.Set(key, found, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = Ttl, Size = 1 });

        return lookup;
    }
}

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

    public async Task<IReadOnlyList<DeezerTrack>> SearchAsync(string query, int limit, CancellationToken ct = default)
    {
        var key = $"deezer:search:{limit}:{query.Trim().ToLowerInvariant()}";
        if (cache.TryGetValue(key, out IReadOnlyList<DeezerTrack>? cached) && cached is not null)
            return cached;

        var results = await inner.SearchAsync(query, limit, ct);

        // Une liste vide peut être un échec (le client renvoie [] dans les deux cas) : seuls les
        // résultats non vides sont gardés.
        if (results.Count > 0)
            cache.Set(key, results, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = Ttl, Size = 1 });

        return results;
    }
}

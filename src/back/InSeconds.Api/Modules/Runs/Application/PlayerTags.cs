using System.Security.Cryptography;

namespace InSeconds.Api.Modules.Runs.Application;

/// <summary>
/// Le repère qui distingue deux joueurs de même pseudo dans une comparaison : quelques caractères d'une empreinte de l'identifiant du joueur
/// (stable pour lui, sans rien révéler de son cookie). Il n'existe que pour les homonymes ; deux homonymes n'ont jamais le même repère (il
/// s'allonge si leurs empreintes commencent pareil).
/// </summary>
public static class PlayerTags
{
    private const int MinLength = 2;

    /// <summary>Le repère de chaque joueur qui partage son pseudo (sans tenir compte de la casse) avec un autre de <paramref name="players"/>.</summary>
    public static IReadOnlyDictionary<Guid, string> ForHomonyms(IReadOnlyCollection<Guid> players, IReadOnlyDictionary<Guid, string> pseudos)
    {
        var tags = new Dictionary<Guid, string>();
        var homonyms = players
            .Where(pseudos.ContainsKey)
            .GroupBy(id => pseudos[id], StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1);
        foreach (var group in homonyms)
        {
            var hashes = group.ToDictionary(id => id, Hash);
            var length = MinLength;
            while (length < 8 && hashes.Values.Select(h => h[..length]).Distinct().Count() < hashes.Count)
                length++;
            foreach (var (id, hash) in hashes)
                tags[id] = hash[..length];
        }
        return tags;
    }

    private static string Hash(Guid id) => Convert.ToHexString(SHA256.HashData(id.ToByteArray())).ToLowerInvariant();
}

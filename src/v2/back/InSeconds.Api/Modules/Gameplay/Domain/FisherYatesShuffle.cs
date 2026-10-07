using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Gameplay.Domain;

/// <summary>
/// Mélange de Fisher-Yates à graine, le tirage du défi du jour de la v1 mis derrière un port : distribution
/// uniforme (aucun biais de position) et même graine, même ordre. La suite de <see cref="Random"/> pour une
/// graine donnée est celle que .NET garantit stable, et c'est elle qui fixe l'ordre : un test épingle un ordre
/// connu, pour qu'un changement d'algorithme (donc des défis différents pour une même date) ne passe pas inaperçu.
/// </summary>
public sealed class FisherYatesShuffle : ISeededShuffle
{
    public IReadOnlyList<T> Shuffle<T>(IEnumerable<T> items, int seed)
    {
        ArgumentNullException.ThrowIfNull(items);
        var list = items.ToList();
        // Pas de sécurité ici : une graine publique (le numéro du jour) est le but, tout le monde joue le même défi.
        var random = new Random(seed);
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = random.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }

        return list;
    }
}

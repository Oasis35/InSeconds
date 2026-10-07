using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Gameplay.Domain;

/// <summary>
/// Mélange de Fisher-Yates à graine, le tirage du défi du jour de la v1 mis derrière un port : distribution
/// uniforme (aucun biais de position) et même graine, même ordre. C'est la suite de <see cref="Random"/> pour une
/// graine donnée qui fixe l'ordre, et .NET ne la garantit pas d'une version majeure à l'autre (en pratique, elle
/// n'a pas changé depuis .NET Core). Un test épingle un ordre connu : si une montée de version de .NET le casse,
/// recopier l'ancien générateur plutôt que mettre à jour l'ordre attendu (sinon, des défis différents pour une
/// même date).
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

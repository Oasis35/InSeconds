namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Un disque : sa clé de traduction (jamais un texte) et ses étoiles (0 tant que l'échelle n'est pas dépassée).</summary>
public sealed record RunDisc(string Key, int Stars);

/// <summary>
/// Le disque d'une partie, selon ses manches passées : la liste des disques va du moins bon au meilleur (0 manche passée : le premier). Au-delà
/// de la liste, le dernier disque prend des étoiles : ★2 pour la première manche de plus, ★3 pour la suivante… (cosmique, cosmique ★2…).
/// </summary>
public static class DiscLadder
{
    public static RunDisc Of(int roundsPassed, IReadOnlyList<string> discs)
    {
        ArgumentNullException.ThrowIfNull(discs);
        ArgumentOutOfRangeException.ThrowIfNegative(roundsPassed);
        if (discs.Count == 0)
            throw new ArgumentException("Il faut au moins un disque.", nameof(discs));

        return roundsPassed < discs.Count
            ? new RunDisc(discs[roundsPassed], 0)
            : new RunDisc(discs[^1], roundsPassed - discs.Count + 2);
    }
}

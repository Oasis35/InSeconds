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

/// <summary>Un disque de l'étagère et le nombre de parties qui l'ont donné.</summary>
public sealed record RunShelfDisc(RunDisc Disc, int Count);

/// <summary>
/// L'étagère des disques d'un joueur (l'accueil du mode) : les disques de ses parties finies, gagnées ou perdues, du moins bon au meilleur, chacun avec
/// son nombre. Une partie sans manche passée n'y pose rien (le premier disque de l'échelle est celui d'un run raté d'entrée : il n'est pas gagné).
/// </summary>
public static class DiscShelf
{
    /// <param name="runsByRoundsPassed">Le nombre de parties finies du joueur, par manches passées.</param>
    /// <param name="discs">L'échelle des disques (<see cref="DiscLadder"/>).</param>
    public static IReadOnlyList<RunShelfDisc> Of(IReadOnlyDictionary<int, int> runsByRoundsPassed, IReadOnlyList<string> discs)
    {
        ArgumentNullException.ThrowIfNull(runsByRoundsPassed);
        return runsByRoundsPassed
            .Where(entry => entry.Key > 0 && entry.Value > 0)
            .OrderBy(entry => entry.Key)
            .GroupBy(entry => DiscLadder.Of(entry.Key, discs))
            .Select(group => new RunShelfDisc(group.Key, group.Sum(entry => entry.Value)))
            .ToList();
    }
}

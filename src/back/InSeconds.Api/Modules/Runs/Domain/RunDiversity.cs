namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// La diversité du tirage : d'une partie à l'autre, un joueur ne retombe pas trop vite sur les mêmes morceaux ni les mêmes thèmes. Pas une durée : des
/// **quantités** (une part du pool, une part des thèmes), de sorte que la mémoire s'adapte seule à la taille du catalogue et à la fréquence de jeu.
/// Toujours une préférence : le tirage relâche (du plus ancien au plus récent) plutôt que de bloquer une partie.
/// </summary>
public static class RunDiversity
{
    /// <summary>
    /// Les morceaux à éviter : les plus récemment entendus, jusqu'à <paramref name="poolPercent"/> % du pool jouable. 0 : aucun. Du plus récent au plus
    /// ancien (le tirage relâche par la fin).
    /// </summary>
    public static IReadOnlyList<int> TracksToAvoid(IReadOnlyList<int> heardRecentFirst, int poolSize, int poolPercent)
    {
        ArgumentNullException.ThrowIfNull(heardRecentFirst);
        var budget = (int)((long)poolSize * Math.Clamp(poolPercent, 0, 100) / 100);
        return budget <= 0 ? [] : [.. heardRecentFirst.Distinct().Take(budget)];
    }

    /// <summary>
    /// Les thèmes à éviter parmi <paramref name="eligible"/> : les plus récemment joués, au plus <paramref name="avoidPercent"/> % des thèmes éligibles (0 :
    /// aucun) et jamais au point d'en laisser moins de <see cref="RunThemes.MinEligibleThemes"/>, le minimum pour proposer un choix. Du plus récent au plus ancien.
    /// </summary>
    public static IReadOnlyList<int> ThemesToAvoid(IReadOnlyList<int> playedRecentFirst, IReadOnlyList<int> eligible, int avoidPercent)
    {
        ArgumentNullException.ThrowIfNull(playedRecentFirst);
        ArgumentNullException.ThrowIfNull(eligible);
        var room = Math.Min(eligible.Count * Math.Clamp(avoidPercent, 0, 100) / 100, eligible.Count - RunThemes.MinEligibleThemes);
        if (room <= 0)
            return [];
        var eligibleSet = eligible.ToHashSet();
        return [.. playedRecentFirst.Distinct().Where(eligibleSet.Contains).Take(room)];
    }
}

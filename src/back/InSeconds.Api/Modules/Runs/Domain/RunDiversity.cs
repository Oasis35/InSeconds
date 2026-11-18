namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Ce qu'un joueur a déjà entendu en Survie, du plus récent au plus ancien : ses morceaux et les thèmes de ses manches (sans doublon). La mémoire de la
/// diversité du tirage ; elle se lit dans ses parties, rien n'est stocké à part.
/// </summary>
public sealed record RunHeardHistory(IReadOnlyList<int> TrackIds, IReadOnlyList<int> ThemeIds)
{
    public static RunHeardHistory Empty { get; } = new([], []);
}

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
    /// Les thèmes à éviter parmi <paramref name="eligible"/> : les plus récemment joués, tant qu'il en reste au moins <paramref name="keepPercent"/> % (et
    /// jamais moins de <see cref="RunThemes.MinEligibleThemes"/>, le minimum pour proposer un choix). Du plus récent au plus ancien.
    /// </summary>
    public static IReadOnlyList<int> ThemesToAvoid(IReadOnlyList<int> playedRecentFirst, IReadOnlyList<int> eligible, int keepPercent)
    {
        ArgumentNullException.ThrowIfNull(playedRecentFirst);
        ArgumentNullException.ThrowIfNull(eligible);
        var keep = Math.Max(RunThemes.MinEligibleThemes, (int)Math.Ceiling(eligible.Count * Math.Clamp(keepPercent, 0, 100) / 100.0));
        var room = eligible.Count - keep;
        if (room <= 0)
            return [];
        var eligibleSet = eligible.ToHashSet();
        return [.. playedRecentFirst.Distinct().Where(eligibleSet.Contains).Take(room)];
    }
}

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Un palier de niveau : la clé de traduction de son disque (<c>runs.discs.gold</c>, jamais un texte) et les points de niveau à partir desquels on l'a.</summary>
public sealed record RunLevelStep(string Disc, int FromPoints);

/// <summary>Où en est un joueur sur l'échelle des disques de niveau.</summary>
/// <param name="Current">Son disque.</param>
/// <param name="Next">Le disque suivant ; vide au dernier.</param>
/// <param name="PointsToNext">Ce qui lui manque pour le disque suivant ; vide au dernier.</param>
/// <param name="ProgressPercent">Sa progression entre son disque et le suivant (de 0 à 100) ; 100 au dernier.</param>
public sealed record RunLevelStanding(RunLevelStep Current, RunLevelStep? Next, int? PointsToNext, int ProgressPercent);

/// <summary>
/// La politique du niveau : les points de niveau sont la **moyenne glissante** des scores des dernières parties finies du joueur (gagnées ou perdues,
/// jamais une partie abandonnée). Ils montent et descendent avec ses parties, rien ne les fait décroître pendant son absence. Provisoires tant que le
/// joueur n'a pas fini assez de parties. Pure : aucune horloge, aucune base (la fenêtre, le nombre de parties provisoires et les seuils sont des
/// réglages <c>Runs:Levels:</c>).
/// </summary>
public static class RunLevelPolicy
{
    /// <summary>Les parties gardées au plus par joueur, quelle que soit la fenêtre réglée (la fenêtre peut grandir sans perdre d'historique).</summary>
    public const int MaxStoredScores = 50;

    /// <summary>La moyenne (arrondie au plus proche) des <paramref name="window"/> derniers scores ; 0 sans partie.</summary>
    public static int Points(IReadOnlyList<int> scores, int window)
    {
        ArgumentNullException.ThrowIfNull(scores);
        ArgumentOutOfRangeException.ThrowIfLessThan(window, 1);
        if (scores.Count == 0)
            return 0;
        var recent = scores.Skip(Math.Max(0, scores.Count - window)).ToList();
        return (int)decimal.Round((decimal)recent.Sum(s => (long)s) / recent.Count, 0, MidpointRounding.AwayFromZero);
    }

    /// <summary>Le niveau est provisoire tant que le joueur n'a pas fini <paramref name="provisionalRuns"/> parties.</summary>
    public static bool IsProvisional(int runsPlayed, int provisionalRuns) => runsPlayed < provisionalRuns;

    /// <summary>La part de ces points dans ceux du plus haut disque, de 0 à 1 : ce que le classement d'un groupe compare.</summary>
    public static double Share(int points, IReadOnlyList<RunLevelStep> ladder)
    {
        ArgumentNullException.ThrowIfNull(ladder);
        var top = ladder.Count == 0 ? 0 : ladder[^1].FromPoints;
        return top <= 0 ? 0d : Math.Clamp((double)points / top, 0d, 1d);
    }

    /// <summary>Le disque de ces points et ce qu'il reste pour le suivant. <paramref name="ladder"/> : du plus bas au plus haut, le premier palier à 0.</summary>
    public static RunLevelStanding Standing(int points, IReadOnlyList<RunLevelStep> ladder)
    {
        ArgumentNullException.ThrowIfNull(ladder);
        if (ladder.Count == 0)
            throw new ArgumentException("Il faut au moins un disque.", nameof(ladder));
        var index = 0;
        for (var i = 0; i < ladder.Count; i++)
        {
            if (points >= ladder[i].FromPoints)
                index = i;
        }

        var current = ladder[index];
        if (index == ladder.Count - 1)
            return new RunLevelStanding(current, null, null, 100);
        var next = ladder[index + 1];
        var span = next.FromPoints - current.FromPoints;
        var progress = span <= 0 ? 100 : Math.Clamp((int)((long)(points - current.FromPoints) * 100 / span), 0, 100);
        return new RunLevelStanding(current, next, next.FromPoints - points, progress);
    }
}

/// <summary>
/// Le niveau d'un joueur (une ligne par joueur, invité compris) : ses points, les scores de ses dernières parties finies, et ce que sa dernière partie
/// a changé (pour l'écran de fin, qui n'affiche son gain que pour cette partie-là). Mis à jour dans la transaction qui termine la partie.
/// </summary>
public sealed class RunLevel
{
    private RunLevel()
    {
    }

    public Guid PlayerId { get; private set; }

    /// <summary>Les points de niveau : la moyenne glissante des scores récents, au moment de la dernière partie.</summary>
    public int Points { get; private set; }

    /// <summary>Les parties finies prises en compte (gagnées ou perdues).</summary>
    public int RunsPlayed { get; private set; }

    /// <summary>Les scores des dernières parties finies, de la plus ancienne à la plus récente (<see cref="RunLevelPolicy.MaxStoredScores"/> au plus).</summary>
    public int[] RecentScores { get; private set; } = [];

    /// <summary>La dernière partie comptée et ce qu'elle a changé aux points.</summary>
    public int? LastSessionId { get; private set; }

    public int LastDelta { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>Le niveau d'un joueur avant sa première partie finie.</summary>
    public static RunLevel Start(Guid playerId, DateTimeOffset now) => new() { PlayerId = playerId, UpdatedAt = now };

    /// <summary>
    /// Compte une partie finie (gagnée ou perdue) : son score entre dans la fenêtre et les points sont recalculés. Une partie déjà comptée ne l'est
    /// pas deux fois.
    /// </summary>
    public void Record(RunSession session, int window, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(session);
        if (session.PlayerId != PlayerId)
            throw new ArgumentException("Ce n'est pas une partie de ce joueur.", nameof(session));
        if (session.Status is not (RunSessionStatus.Won or RunSessionStatus.Lost))
            throw new InvalidOperationException("Seule une partie gagnée ou perdue compte pour le niveau.");
        if (LastSessionId == session.Id)
            return;

        var before = Points;
        RecentScores = [.. RecentScores, Math.Max(0, session.TotalScore)];
        if (RecentScores.Length > RunLevelPolicy.MaxStoredScores)
            RecentScores = RecentScores[^RunLevelPolicy.MaxStoredScores..];
        RunsPlayed++;
        Points = RunLevelPolicy.Points(RecentScores, window);
        LastDelta = Points - before;
        LastSessionId = session.Id;
        UpdatedAt = now;
    }

    /// <summary>Ce que cette partie a changé aux points ; vide si ce n'est pas la dernière partie comptée.</summary>
    public int? DeltaOf(int sessionId) => LastSessionId == sessionId ? LastDelta : null;
}

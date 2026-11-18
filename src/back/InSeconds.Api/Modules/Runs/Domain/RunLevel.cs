namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Un palier de niveau : la clé de traduction de son disque (<c>runs.discs.gold</c>, jamais un texte) et les points de niveau à partir desquels on l'a.</summary>
public sealed record RunLevelStep(string Disc, int FromPoints);

/// <summary>Où en est un joueur sur l'échelle des disques de niveau.</summary>
/// <param name="Current">Son disque ; vide tant qu'il n'a pas les points du premier.</param>
/// <param name="Next">Le disque suivant ; vide au dernier.</param>
/// <param name="PointsToNext">Ce qui lui manque pour le disque suivant ; vide au dernier.</param>
/// <param name="ProgressPercent">Sa progression entre son disque (0 sans disque) et le suivant (de 0 à 100) ; 100 au dernier.</param>
public sealed record RunLevelStanding(RunLevelStep? Current, RunLevelStep? Next, int? PointsToNext, int ProgressPercent);

/// <summary>Les règles du niveau, tirées des réglages <c>Runs:Levels:</c> (relus à chaud, jamais figés dans une playlist).</summary>
/// <param name="OldWeightPercent">La part de l'ancien niveau dans le nouveau (80 : 80 % de l'ancien niveau, 20 % du score de la série).</param>
/// <param name="MaxDropPercent">Une série ne fait pas perdre plus de cette part du niveau.</param>
/// <param name="InactivityGraceDays">Les jours sans partie finie avant que le niveau ne baisse.</param>
/// <param name="InactivityWeeklyDropPercent">Ce que le niveau perd par semaine d'inactivité après la grâce (part du niveau de la dernière partie).</param>
/// <param name="InactivityFloorPercent">L'inactivité ne descend jamais sous cette part du niveau de la dernière partie.</param>
/// <param name="Ladder">Les disques, du plus bas au plus haut, le premier au-dessus de 0.</param>
public sealed record RunLevelRules(
    int OldWeightPercent, int MaxDropPercent, int InactivityGraceDays, int InactivityWeeklyDropPercent, int InactivityFloorPercent,
    IReadOnlyList<RunLevelStep> Ladder);

/// <summary>Ce qu'une série a fait au disque du joueur.</summary>
public enum RunDiscChange
{
    Same,
    Up,
    Down,
}

/// <summary>Le niveau d'un joueur à un instant : ses points après l'inactivité, et quand son disque baissera s'il ne joue pas.</summary>
/// <param name="Points">Ses points de niveau, inactivité déduite.</param>
/// <param name="InactivityLoss">Ce que l'inactivité lui a retiré depuis sa dernière partie finie.</param>
/// <param name="DiscDropInDays">Dans combien de jours (au moins 1) l'inactivité lui fera perdre son disque ; vide sans disque, ou si le plancher le garde.</param>
public sealed record RunLevelNow(int Points, int InactivityLoss, int? DiscDropInDays);

/// <summary>
/// La politique du niveau (pure : aucune horloge, aucune base). Après chaque série finie (vies épuisées ou Série complète), le niveau devient
/// <c>80 % de l'ancien + 20 % du score</c>, sans perdre plus de 10 % ni monter de plus d'un disque (plafonné au seuil du disque juste au-dessus). Rien
/// de provisoire, le fantôme n'y est pour rien. Sans partie finie pendant 14 jours, le niveau baisse de 5 % par semaine, jamais sous la moitié :
/// **calculé à la lecture**, aucune tâche de nuit (le niveau stocké reste celui de la dernière partie).
/// </summary>
public static class RunLevelPolicy
{
    private const int DaysPerWeek = 7;

    /// <summary>
    /// La transition du niveau, seule écrite : le niveau de la dernière série (<paramref name="points"/>, finie à <paramref name="lastPlayedAt"/> ;
    /// vide avant la première), l'inactivité jusqu'à la fin de la nouvelle série (<paramref name="endedAt"/>), puis la formule. Rend le niveau d'avant
    /// (inactivité déduite) et celui d'après. Partagée par <see cref="RunLevel.Record"/> et le rejeu des Hits.
    /// </summary>
    public static (int Before, int After) Apply(int points, DateTimeOffset? lastPlayedAt, int score, DateTimeOffset endedAt, RunLevelRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var before = lastPlayedAt is { } last ? Now(points, last, endedAt, rules).Points : 0;
        return (before, Next(before, score, rules));
    }

    /// <summary>Le niveau après une série finie : <paramref name="current"/> est le niveau d'avant, inactivité déduite.</summary>
    public static int Next(int current, int score, RunLevelRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        current = Math.Max(0, current);
        score = Math.Max(0, score);
        var raw = (int)decimal.Round(((decimal)current * rules.OldWeightPercent + (decimal)score * (100 - rules.OldWeightPercent)) / 100, 0, MidpointRounding.AwayFromZero);
        var floor = (int)Math.Ceiling((decimal)current * (100 - rules.MaxDropPercent) / 100);
        var cap = rules.Ladder.FirstOrDefault(s => s.FromPoints > current)?.FromPoints ?? int.MaxValue;
        return Math.Max(floor, Math.Min(raw, cap));
    }

    /// <summary>Les semaines d'inactivité qui comptent : 0 pendant la grâce, 1 dès qu'elle est finie, 2 une semaine après…</summary>
    public static int InactiveWeeks(DateTimeOffset lastPlayedAt, DateTimeOffset now, RunLevelRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var days = (now - lastPlayedAt).TotalDays;
        return days < rules.InactivityGraceDays ? 0 : (int)Math.Min(1000, Math.Floor((days - rules.InactivityGraceDays) / DaysPerWeek) + 1);
    }

    /// <summary>Les points de <paramref name="points"/> après <paramref name="weeks"/> semaines d'inactivité.</summary>
    public static int AfterInactivity(int points, int weeks, RunLevelRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        if (weeks <= 0 || points <= 0)
            return Math.Max(0, points);
        var floor = (long)points * rules.InactivityFloorPercent / 100;
        var decayed = (long)points * Math.Max(0, 100 - ((long)rules.InactivityWeeklyDropPercent * weeks)) / 100;
        return (int)Math.Max(floor, decayed);
    }

    /// <summary>Le niveau d'un joueur maintenant : <paramref name="points"/> est le niveau de sa dernière partie finie, jouée à <paramref name="lastPlayedAt"/>.</summary>
    public static RunLevelNow Now(int points, DateTimeOffset lastPlayedAt, DateTimeOffset now, RunLevelRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var weeks = InactiveWeeks(lastPlayedAt, now, rules);
        var effective = AfterInactivity(points, weeks, rules);
        var disc = Standing(effective, rules.Ladder).Current;
        int? dropIn = null;
        if (disc is not null && rules.InactivityWeeklyDropPercent > 0 && AfterInactivity(points, 1000, rules) < disc.FromPoints)
        {
            var week = weeks + 1;
            while (AfterInactivity(points, week, rules) >= disc.FromPoints)
                week++;
            var at = lastPlayedAt.AddDays(rules.InactivityGraceDays + ((week - 1) * DaysPerWeek));
            dropIn = Math.Max(1, (int)Math.Ceiling((at - now).TotalDays));
        }

        return new RunLevelNow(effective, points - effective, dropIn);
    }

    /// <summary>La part de ces points dans ceux du plus haut disque, de 0 à 1 : ce que le classement d'un groupe compare.</summary>
    public static double Share(int points, IReadOnlyList<RunLevelStep> ladder)
    {
        ArgumentNullException.ThrowIfNull(ladder);
        var top = ladder.Count == 0 ? 0 : ladder[^1].FromPoints;
        return top <= 0 ? 0d : Math.Clamp((double)points / top, 0d, 1d);
    }

    /// <summary>Le disque de ces points (aucun sous le premier) et ce qu'il reste pour le suivant. <paramref name="ladder"/> : du plus bas au plus haut.</summary>
    public static RunLevelStanding Standing(int points, IReadOnlyList<RunLevelStep> ladder)
    {
        ArgumentNullException.ThrowIfNull(ladder);
        if (ladder.Count == 0)
            throw new ArgumentException("Il faut au moins un disque.", nameof(ladder));
        var index = -1;
        for (var i = 0; i < ladder.Count; i++)
        {
            if (points >= ladder[i].FromPoints)
                index = i;
        }

        var current = index < 0 ? null : ladder[index];
        if (index == ladder.Count - 1)
            return new RunLevelStanding(current, null, null, 100);
        var next = ladder[index + 1];
        var from = current?.FromPoints ?? 0;
        var span = next.FromPoints - from;
        var progress = span <= 0 ? 100 : Math.Clamp((int)((long)(points - from) * 100 / span), 0, 100);
        return new RunLevelStanding(current, next, next.FromPoints - points, progress);
    }

    /// <summary>Le sens du changement de disque entre deux niveaux.</summary>
    public static RunDiscChange DiscChange(int before, int after, IReadOnlyList<RunLevelStep> ladder)
    {
        var from = Standing(before, ladder).Current?.FromPoints ?? -1;
        var to = Standing(after, ladder).Current?.FromPoints ?? -1;
        return to > from ? RunDiscChange.Up : to < from ? RunDiscChange.Down : RunDiscChange.Same;
    }
}

/// <summary>
/// Le niveau d'un joueur (une ligne par joueur, invité compris) : ses points à sa dernière série finie, et ce que cette série a changé (pour l'écran
/// de fin, qui n'affiche son gain que pour elle). Mis à jour dans la transaction qui termine la partie ; l'inactivité se déduit à la lecture
/// (<see cref="RunLevelPolicy.Now"/>), à partir de <see cref="UpdatedAt"/>.
/// </summary>
public sealed class RunLevel
{
    private RunLevel()
    {
    }

    public Guid PlayerId { get; private set; }

    /// <summary>Les points de niveau à la dernière série finie, avant toute inactivité.</summary>
    public int Points { get; private set; }

    /// <summary>Les séries finies prises en compte (vies épuisées ou Série complète).</summary>
    public int RunsPlayed { get; private set; }

    /// <summary>La dernière partie comptée et ce qu'elle a changé aux points (comparé au niveau d'avant, inactivité déduite).</summary>
    public int? LastSessionId { get; private set; }

    public int LastDelta { get; private set; }

    /// <summary>La fin de la dernière série comptée : le départ de l'inactivité.</summary>
    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>Le niveau d'un joueur avant sa première partie finie.</summary>
    public static RunLevel Start(Guid playerId, DateTimeOffset now) => new() { PlayerId = playerId, UpdatedAt = now };

    /// <summary>Le niveau maintenant, inactivité déduite.</summary>
    public RunLevelNow At(DateTimeOffset now, RunLevelRules rules) =>
        RunsPlayed == 0 ? new RunLevelNow(0, 0, null) : RunLevelPolicy.Now(Points, UpdatedAt, now, rules);

    /// <summary>
    /// Compte une série finie (vies épuisées ou Série complète) : le niveau d'avant (inactivité déduite jusqu'à la fin de la série) et son score
    /// donnent le nouveau (<see cref="RunLevelPolicy.Apply"/>). Une partie déjà comptée ne l'est pas deux fois.
    /// </summary>
    public void Record(RunSession session, RunLevelRules rules)
    {
        ArgumentNullException.ThrowIfNull(session);
        ArgumentNullException.ThrowIfNull(rules);
        if (session.PlayerId != PlayerId)
            throw new ArgumentException("Ce n'est pas une partie de ce joueur.", nameof(session));
        if (!session.IsFinished)
            throw new InvalidOperationException("Seule une partie terminée (vies épuisées ou Série complète) compte pour le niveau.");
        if (LastSessionId == session.Id)
            return;

        var endedAt = session.EndedAt ?? throw new InvalidOperationException("Une partie finie a une date de fin.");
        var (before, after) = RunLevelPolicy.Apply(Points, RunsPlayed == 0 ? null : UpdatedAt, session.TotalScore, endedAt, rules);
        Points = after;
        RunsPlayed++;
        LastDelta = after - before;
        LastSessionId = session.Id;
        UpdatedAt = endedAt;
    }

    /// <summary>Ce que cette partie a changé aux points ; vide si ce n'est pas la dernière partie comptée.</summary>
    public int? DeltaOf(int sessionId) => LastSessionId == sessionId ? LastDelta : null;

    /// <summary>Ce que la dernière partie comptée a fait au disque.</summary>
    public RunDiscChange LastDiscChange(IReadOnlyList<RunLevelStep> ladder) => RunLevelPolicy.DiscChange(Points - LastDelta, Points, ladder);

    /// <summary>Ce que cette partie a fait au disque ; vide si ce n'est pas la dernière partie comptée.</summary>
    public RunDiscChange? DiscChangeOf(int sessionId, IReadOnlyList<RunLevelStep> ladder) => LastSessionId == sessionId ? LastDiscChange(ladder) : null;
}

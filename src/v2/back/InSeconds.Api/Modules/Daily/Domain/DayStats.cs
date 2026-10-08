namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Une partie d'un défi, vue des statistiques : qui, dans quel état, pour combien de points.</summary>
public sealed record DaySessionRow(Guid PlayerId, SessionStatus Status, int TotalScore);

/// <summary>Le morceau d'un défi à sa position (Daily ne connaît le morceau que par son identifiant).</summary>
public sealed record ChallengeTrackRef(int Position, int TrackId);

/// <summary>
/// Ce que les joueurs ont répondu sur un morceau d'un défi, agrégé : de quoi calculer tous les chiffres d'un morceau (taux, moyennes, histogramme).
/// </summary>
/// <param name="Total">Réponses données.</param>
/// <param name="Found">Dont l'artiste ou le titre est trouvé.</param>
/// <param name="ListenedSum">Somme des durées écoutées de toutes les réponses.</param>
/// <param name="FoundListenedSum">Somme des durées écoutées des réponses où quelque chose est trouvé.</param>
/// <param name="FoundByDuration">Réponses trouvées, par palier d'écoute.</param>
public sealed record TrackAggregate(
    int Position, int Total, int ArtistCorrect, int TitleCorrect, int Found, int Extended, decimal ListenedSum, decimal FoundListenedSum,
    IReadOnlyDictionary<decimal, int> FoundByDuration)
{
    public static TrackAggregate Empty(int position) => new(position, 0, 0, 0, 0, 0, 0, 0, new Dictionary<decimal, int>());

    public int NotFound => Total - Found;
}

/// <summary>Nombre de joueurs dont le score total tombe dans [<c>MinScore</c>, <c>MaxScore</c>].</summary>
public sealed record ScoreBucket(int MinScore, int MaxScore, int Count);

/// <summary>
/// L'égaliseur « répartition des scores du jour » (v1 : <c>Common/Stats/ScoreDistribution</c>) : <see cref="BucketCount"/> tranches de même
/// largeur couvrant [0, score maximal possible], comptes à 0 compris.
/// </summary>
public static class ScoreDistribution
{
    public const int BucketCount = 10;

    public static IReadOnlyList<ScoreBucket> Build(IReadOnlyCollection<int> scores, int maxPossibleScore)
    {
        ArgumentNullException.ThrowIfNull(scores);
        if (maxPossibleScore <= 0)
            return [];

        var width = (int)Math.Ceiling(maxPossibleScore / (double)BucketCount);
        var counts = new int[BucketCount];
        foreach (var score in scores)
            counts[BucketIndex(score, width)]++;

        return Enumerable.Range(0, BucketCount)
            .Select(i => new ScoreBucket(i * width, i == BucketCount - 1 ? maxPossibleScore : (i + 1) * width - 1, counts[i]))
            .ToList();
    }

    /// <summary>
    /// Part (en %, arrondie) des **autres** joueurs dont le score est strictement inférieur à celui-ci. Vide si le joueur n'a pas de score ou joue
    /// seul : son score fait partie de <paramref name="scores"/>, on le retire une fois du dénominateur.
    /// </summary>
    public static int? BetterThanPercent(IReadOnlyCollection<int> scores, int? yourScore)
    {
        ArgumentNullException.ThrowIfNull(scores);
        if (yourScore is null || scores.Count <= 1)
            return null;

        var below = scores.Count(s => s < yourScore.Value);
        return (int)Math.Round(below * 100.0 / (scores.Count - 1), MidpointRounding.AwayFromZero);
    }

    // Un score au-delà du maximum (barème changé en cours de journée) tombe dans la dernière tranche plutôt que de sortir du tableau.
    private static int BucketIndex(int score, int width) => Math.Clamp(score / width, 0, BucketCount - 1);
}

/// <summary>Les médianes de la v1 : celle de « stats du jour » est entière (division entière des deux valeurs centrales), celle de l'admin décimale.</summary>
public static class Medians
{
    /// <summary>Médiane entière : 0 sans joueur (v1 : <c>TodayStatsHandler.ComputeMedian</c>).</summary>
    public static int Integer(IReadOnlyCollection<int> values)
    {
        ArgumentNullException.ThrowIfNull(values);
        if (values.Count == 0)
            return 0;
        var sorted = values.Order().ToList();
        var mid = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /// <summary>Médiane décimale, vide sans joueur (v1 : <c>MedianCalculator</c>).</summary>
    public static double? Decimal(IReadOnlyCollection<int> values)
    {
        ArgumentNullException.ThrowIfNull(values);
        if (values.Count == 0)
            return null;
        var sorted = values.Order().ToList();
        return sorted.Count % 2 == 1 ? sorted[sorted.Count / 2] : (sorted[sorted.Count / 2 - 1] + sorted[sorted.Count / 2]) / 2.0;
    }
}

/// <summary>Un joueur d'un défi : son statut et son score. Le pseudo n'est pas figé : il est joint à la lecture, pour suivre un changement.</summary>
public sealed record DayPlayer(Guid PlayerId, string Status, int Score);

/// <summary>
/// Les chiffres d'un morceau du défi. Le titre et l'artiste ne sont pas figés non plus (<see cref="TrackId"/>) : joints à la lecture, pour suivre un
/// renommage.
/// </summary>
public sealed record DayTrackStats(
    int Position, int TrackId, int TotalAnswers, double ArtistCorrectRate, double TitleCorrectRate, double ExtendedRate, double? AvgListenedSeconds,
    IReadOnlyList<DurationBucket> GuessTimeDistribution, int NotFoundCount);

/// <summary>
/// La photo d'un jour (§ 5.4 du plan v2) : tout ce que montrent « stats par défi » et la répartition des scores, **plus les paliers et le barème en
/// vigueur au calcul** (deux jours après pour la tâche, le moment du recalcul pour l'admin) : changer un réglage ensuite ne réécrit pas la photo.
/// L'histogramme garde aussi tout palier réellement écouté qui n'est plus dans le réglage. Les joueurs supprimés en sont exclus.
/// </summary>
/// <param name="PlayerCount">Parties terminées.</param>
/// <param name="PendingCount">Parties en cours : toujours 0 pour un jour passé, repliées sur <paramref name="ExpiredCount"/> (le joueur n'est jamais revenu).</param>
/// <param name="MaxPossibleScore">Nombre de morceaux × meilleur palier : la borne haute de la répartition.</param>
public sealed record DayStatsPayload(
    int Version,
    DateOnly Date,
    int ChallengeId,
    IReadOnlyList<decimal> AllowedDurationsSeconds,
    IReadOnlyList<DurationScore> DurationScores,
    int MaxPossibleScore,
    int PlayerCount,
    int PendingCount,
    int AbandonedCount,
    int ExpiredCount,
    int? ScoreMin,
    int? ScoreMax,
    double? ScoreAvg,
    double? ScoreMedian,
    IReadOnlyList<ScoreBucket> ScoreDistribution,
    IReadOnlyList<DayTrackStats> Tracks,
    IReadOnlyList<DayPlayer> Players)
{
    /// <summary>Le format du contenu : il permet de le faire évoluer sans casser les photos déjà figées.</summary>
    public const int CurrentVersion = 1;
}

/// <summary>Calcule la photo d'un jour (v1 : <c>GetChallengeStats.BuildChallengeStats</c>, plus la répartition des scores du jour).</summary>
public static class DayStatsCalculator
{
    /// <param name="isPast">Le jour est révolu : les parties encore « en cours » n'ont jamais été terminées, elles comptent comme expirées.</param>
    public static DayStatsPayload Build(
        DateOnly date,
        int challengeId,
        bool isPast,
        IReadOnlyList<DaySessionRow> sessions,
        IReadOnlyList<ChallengeTrackRef> tracks,
        IReadOnlyDictionary<int, TrackAggregate> aggregates,
        IReadOnlyList<decimal> allowedDurations,
        IReadOnlyList<DurationScore> durationScores)
    {
        ArgumentNullException.ThrowIfNull(sessions);
        ArgumentNullException.ThrowIfNull(tracks);
        ArgumentNullException.ThrowIfNull(aggregates);
        ArgumentNullException.ThrowIfNull(allowedDurations);
        ArgumentNullException.ThrowIfNull(durationScores);

        var scores = sessions.Where(s => s.Status == SessionStatus.Completed).Select(s => s.TotalScore).ToList();
        var pending = sessions.Count(s => s.Status == SessionStatus.Pending);
        var expired = sessions.Count(s => s.Status == SessionStatus.Expired);
        var (pendingCount, expiredCount) = isPast ? (0, expired + pending) : (pending, expired);
        var maxPossible = tracks.Count * (durationScores.Count == 0 ? 0 : durationScores.Max(d => d.Score));

        // Les paliers de l'histogramme : ceux du réglage, plus tout palier réellement écouté qui n'y est plus (réglage changé depuis ce jour-là, ou
        // historique importé) ; sinon ces réponses trouvées disparaîtraient de la photo, alors qu'elle est figée pour de bon.
        var guessDurations = allowedDurations
            .Concat(aggregates.Values.SelectMany(a => a.FoundByDuration.Keys))
            .Distinct().OrderBy(d => d).ToList();

        var trackStats = tracks.OrderBy(t => t.Position).Select(t =>
        {
            var a = aggregates.GetValueOrDefault(t.Position) ?? TrackAggregate.Empty(t.Position);
            var distribution = guessDurations
                .Select(d => new DurationBucket(d, a.FoundByDuration.GetValueOrDefault(d)))
                .ToList();
            return new DayTrackStats(
                t.Position, t.TrackId, a.Total,
                Rate(a.ArtistCorrect, a.Total), Rate(a.TitleCorrect, a.Total), Rate(a.Extended, a.Total),
                a.Total == 0 ? null : Math.Round((double)(a.ListenedSum / a.Total), 2),
                distribution, a.NotFound);
        }).ToList();

        return new DayStatsPayload(
            DayStatsPayload.CurrentVersion, date, challengeId,
            allowedDurations.Distinct().OrderBy(d => d).ToList(), durationScores,
            maxPossible, scores.Count, pendingCount, sessions.Count(s => s.Status == SessionStatus.Abandoned), expiredCount,
            scores.Count == 0 ? null : scores.Min(), scores.Count == 0 ? null : scores.Max(),
            scores.Count == 0 ? null : Math.Round(scores.Average(), 1), Medians.Decimal(scores),
            ScoreDistribution.Build(scores, maxPossible),
            trackStats,
            sessions.Select(s => new DayPlayer(s.PlayerId, StatusName(s.Status, isPast), s.TotalScore)).ToList());
    }

    private static double Rate(int part, int total) => total == 0 ? 0 : Math.Round((double)part / total * 100, 1);

    // Un jour révolu n'a plus de partie « en cours » : celle qui n'a jamais été reprise est expirée.
    private static string StatusName(SessionStatus status, bool isPast) => status switch
    {
        SessionStatus.Pending when isPast => nameof(SessionStatus.Expired),
        _ => status.ToString(),
    };
}

/// <summary>La photo figée d'un jour terminé pour de bon (§ 4.4 du plan v2, table <c>challenge_day_stats</c>) : calculée une fois, relue telle quelle.</summary>
public sealed class DayStatsSnapshot
{
    private DayStatsSnapshot()
    {
    }

    public int ChallengeId { get; private set; }

    public DateTimeOffset ComputedAt { get; private set; }

    public short Version { get; private set; }

    /// <summary>Le contenu (<see cref="DayStatsPayload"/>) en JSON.</summary>
    public string Payload { get; private set; } = "";

    public static DayStatsSnapshot Create(int challengeId, DateTimeOffset now, short version, string payload) =>
        new() { ChallengeId = challengeId, ComputedAt = now, Version = version, Payload = payload };

    /// <summary>Recalcul (admin) : le contenu est remplacé, la ligne reste.</summary>
    public void Replace(DateTimeOffset now, short version, string payload)
    {
        ComputedAt = now;
        Version = version;
        Payload = payload;
    }
}

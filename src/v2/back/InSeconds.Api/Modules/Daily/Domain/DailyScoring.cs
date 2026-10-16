using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>
/// Les points d'une réponse (§ 5.3 du plan v2) : le calcul appartient au mode, la manche n'en donne pas. Moins on écoute, plus on
/// gagne ; l'indice coûte un pourcentage.
/// </summary>
public interface IDailyScoringPolicy
{
    int Score(RoundOutcome outcome);

    /// <summary>Le pourcentage retiré pour ce niveau d'indice (0 : aucun indice, ou niveau sans pénalité).</summary>
    int HintPenaltyPercent(int hintLevel);
}

/// <summary>Un palier d'écoute et ses points (<c>Daily:DurationScores</c>).</summary>
public sealed record DurationScore(decimal Seconds, int Score);

/// <summary>
/// Le barème de la v1 (<c>ScoreCalculator</c>), repris tel quel : rien si ni l'artiste ni le titre n'est trouvé ; un palier inconnu
/// vaut 0 ; artiste et titre = le barème du palier, un seul des deux = la moitié ; puis la pénalité de l'indice sur ce score.
/// </summary>
public sealed class DurationScoringPolicy : IDailyScoringPolicy
{
    private readonly IReadOnlyDictionary<decimal, int> _baseScores;
    private readonly IReadOnlyDictionary<int, int> _hintPenaltyPercent;

    public DurationScoringPolicy(IEnumerable<DurationScore> durationScores, IReadOnlyDictionary<int, int> hintPenaltyPercent)
    {
        ArgumentNullException.ThrowIfNull(durationScores);
        ArgumentNullException.ThrowIfNull(hintPenaltyPercent);
        // Un palier écrit deux fois dans les réglages : le dernier l'emporte, sans exception.
        _baseScores = durationScores.GroupBy(d => d.Seconds).ToDictionary(g => g.Key, g => g.Last().Score);
        _hintPenaltyPercent = hintPenaltyPercent;
    }

    public int Score(RoundOutcome outcome)
    {
        ArgumentNullException.ThrowIfNull(outcome);
        if (!outcome.FoundAny || !_baseScores.TryGetValue(outcome.ListenedSeconds, out var baseScore))
            return 0;

        // Arrondi de la v1 (au pair le plus proche), pour que les scores restent ceux que les joueurs ont déjà vus.
        var score = outcome.FoundBoth ? baseScore : (int)Math.Round(baseScore * 0.5);
        var penalty = HintPenaltyPercent(outcome.HintLevelUsed);
        return penalty > 0 ? (int)Math.Round(score * (1 - penalty / 100m)) : score;
    }

    public int HintPenaltyPercent(int hintLevel) =>
        hintLevel > 0 && _hintPenaltyPercent.TryGetValue(hintLevel, out var percent) ? percent : 0;
}

/// <summary>
/// Les statistiques d'un morceau, ce que la révélation montre juste après la réponse (v1 : <c>SubmitAnswerHandler.BuildAnswerStats</c>) :
/// la moyenne d'écoute de ceux qui l'ont trouvé, le taux d'échec, et « en combien de temps les autres ont trouvé ».
/// </summary>
public static class TrackAnswerStats
{
    public static AnswerStats Build(PriorAnswerStats prior, RoundOutcome outcome, IEnumerable<decimal> allowedDurations)
    {
        ArgumentNullException.ThrowIfNull(prior);
        ArgumentNullException.ThrowIfNull(outcome);
        var found = outcome.FoundAny;
        var total = prior.Total + 1;
        var foundCount = prior.FoundCount + (found ? 1 : 0);
        var foundSum = prior.FoundSeconds + (found ? outcome.ListenedSeconds : 0);
        var notFound = prior.NotFoundCount + (found ? 0 : 1);

        var counts = new Dictionary<decimal, int>(prior.FoundCountByDuration);
        if (found)
            counts[outcome.ListenedSeconds] = counts.GetValueOrDefault(outcome.ListenedSeconds) + 1;

        // Un palier par durée autorisée, comptes à 0 compris, dans l'ordre croissant.
        var distribution = allowedDurations.Distinct().OrderBy(d => d)
            .Select(d => new DurationBucket(d, counts.GetValueOrDefault(d)))
            .ToList();

        return new AnswerStats(
            foundCount == 0 ? null : (double)(foundSum / foundCount),
            Math.Round((double)notFound / total * 100, 1),
            distribution,
            notFound);
    }
}

/// <summary>Ce que les autres joueurs ont déjà donné sur ce morceau, avant la réponse en cours.</summary>
/// <param name="Total">Réponses déjà enregistrées.</param>
/// <param name="FoundCount">Dont celles où l'artiste ou le titre est trouvé.</param>
/// <param name="FoundSeconds">Somme des durées écoutées de ces réponses.</param>
/// <param name="NotFoundCount">Dont celles où rien n'est trouvé.</param>
/// <param name="FoundCountByDuration">Réponses trouvées, par palier d'écoute.</param>
public sealed record PriorAnswerStats(
    int Total, int FoundCount, decimal FoundSeconds, int NotFoundCount, IReadOnlyDictionary<decimal, int> FoundCountByDuration)
{
    public static PriorAnswerStats None { get; } = new(0, 0, 0, 0, new Dictionary<decimal, int>());
}

/// <summary>Une barre de l'histogramme : le palier d'écoute et le nombre de joueurs qui ont trouvé à ce palier.</summary>
public sealed record DurationBucket(decimal Seconds, int Count);

public sealed record AnswerStats(
    double? AverageSecondsWhenFound, double FailureRatePercent, IReadOnlyList<DurationBucket> GuessTimeDistribution, int NotFoundCount);

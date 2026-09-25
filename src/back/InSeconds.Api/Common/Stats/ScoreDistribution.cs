namespace InSeconds.Api.Common.Stats;

/// <summary>
/// Construit l'égaliseur « répartition des scores du jour » : <see cref="BucketCount"/> tranches
/// de même largeur couvrant [0, score maximal possible], comptes à 0 inclus.
/// </summary>
public static class ScoreDistribution
{
    public const int BucketCount = 10;

    public static List<ScoreBucketDto> Build(IReadOnlyCollection<int> scores, int maxPossibleScore)
    {
        if (maxPossibleScore <= 0)
            return [];

        var width = (int)Math.Ceiling(maxPossibleScore / (double)BucketCount);
        var counts = new int[BucketCount];
        foreach (var score in scores)
            counts[BucketIndex(score, width)]++;

        return Enumerable.Range(0, BucketCount)
            .Select(i => new ScoreBucketDto(
                MinScore: i * width,
                MaxScore: i == BucketCount - 1 ? maxPossibleScore : (i + 1) * width - 1,
                Count:    counts[i]))
            .ToList();
    }

    /// <summary>
    /// Part (en %, arrondie) des <em>autres</em> joueurs dont le score est strictement inférieur
    /// à <paramref name="yourScore"/>. <c>null</c> si le joueur n'a pas de score ou joue seul.
    /// </summary>
    public static int? BetterThanPercent(IReadOnlyCollection<int> scores, int? yourScore)
    {
        // Le score du joueur fait partie de `scores` : on le retire une fois du dénominateur.
        if (yourScore is null || scores.Count <= 1)
            return null;

        var below = scores.Count(s => s < yourScore.Value);
        return (int)Math.Round(below * 100.0 / (scores.Count - 1), MidpointRounding.AwayFromZero);
    }

    // Un score au-delà du maximum (réglage des points modifié en cours de journée) tombe
    // dans la dernière tranche plutôt que de sortir du tableau.
    private static int BucketIndex(int score, int width)
        => Math.Clamp(score / width, 0, BucketCount - 1);
}

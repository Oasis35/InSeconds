namespace InSeconds.Api.Common.Scoring;

public sealed class ScoreCalculator
{
    public int Calculate(
        decimal listenedDurationSeconds,
        bool artistCorrect,
        bool titleCorrect,
        Dictionary<decimal, int> durationScores,
        int hintLevelUsed = 0,
        Dictionary<int, int>? hintPenaltyPercent = null)
    {
        if (!artistCorrect && !titleCorrect)
            return 0;

        if (!durationScores.TryGetValue(listenedDurationSeconds, out var baseScore))
            return 0;

        var score = artistCorrect && titleCorrect
            ? baseScore
            : (int)Math.Round(baseScore * 0.5);

        if (hintLevelUsed > 0
            && hintPenaltyPercent is not null
            && hintPenaltyPercent.TryGetValue(hintLevelUsed, out var penaltyPercent))
        {
            score = (int)Math.Round(score * (1 - penaltyPercent / 100m));
        }

        return score;
    }
}

namespace InSeconds.Api.Common.Scoring;

public sealed class ScoreCalculator
{
    public int Calculate(
        decimal listenedDurationSeconds,
        bool wasExtended,
        bool artistCorrect,
        bool titleCorrect,
        Dictionary<decimal, int> durationScores)
    {
        if (!artistCorrect && !titleCorrect)
            return 0;

        if (!durationScores.TryGetValue(listenedDurationSeconds, out var baseScore))
            return 0;

        if (wasExtended)
            baseScore = (int)Math.Round(baseScore * 0.75);

        if (artistCorrect && titleCorrect)
            return baseScore;

        return (int)Math.Round(baseScore * 0.5);
    }
}

namespace InSeconds.Api.Common.Scoring;

public sealed class ScoreCalculator
{
    private static readonly Dictionary<int, int> BaseScores = new()
    {
        [1]  = 1000,
        [2]  = 850,
        [3]  = 700,
        [5]  = 500,
        [10] = 300,
        [15] = 150,
        [30] = 50,
    };

    public int Calculate(int listenedDurationSeconds, bool wasExtended, bool artistCorrect, bool titleCorrect)
    {
        if (!artistCorrect && !titleCorrect)
            return 0;

        if (!BaseScores.TryGetValue(listenedDurationSeconds, out var baseScore))
            return 0;

        if (wasExtended)
            baseScore = (int)Math.Round(baseScore * 0.75);

        if (artistCorrect && titleCorrect)
            return baseScore;

        return (int)Math.Round(baseScore * 0.5);
    }
}

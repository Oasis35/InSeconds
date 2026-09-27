namespace InSeconds.Api.Common.Stats;

/// <summary>
/// Médiane d'une série de scores entiers (moyenne des deux valeurs centrales si effectif pair).
/// </summary>
public static class MedianCalculator
{
    public static double? Compute(IReadOnlyCollection<int> values)
    {
        if (values.Count == 0) return null;

        var sorted = values.OrderBy(v => v).ToList();
        return sorted.Count % 2 == 1
            ? sorted[sorted.Count / 2]
            : (sorted[sorted.Count / 2 - 1] + sorted[sorted.Count / 2]) / 2.0;
    }
}

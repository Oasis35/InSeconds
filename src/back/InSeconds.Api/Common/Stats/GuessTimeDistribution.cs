namespace InSeconds.Api.Common.Stats;

/// <summary>
/// Construit l'histogramme « en combien de temps les autres ont trouvé » : un bucket par palier
/// autorisé (ordre croissant, comptes à 0 inclus), alimenté par les comptes de bonnes réponses.
/// </summary>
public static class GuessTimeDistribution
{
    public static List<DurationBucketDto> Build(
        IEnumerable<decimal> allowedDurations,
        IReadOnlyDictionary<decimal, int> correctCountsByDuration)
        => allowedDurations
            .OrderBy(d => d)
            .Select(d => new DurationBucketDto(d, correctCountsByDuration.GetValueOrDefault(d)))
            .ToList();
}

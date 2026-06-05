using InSeconds.Api.Domain;

namespace InSeconds.Api.Common.Settings;

public sealed record AppSettings(
    int[] AllowedDurationsSeconds,
    int GuessTimerSeconds,
    int MaxExtensionsPerAnswer,
    int TracksPerChallenge,
    Dictionary<int, int> DurationScores)
{
    public static readonly AppSettings Default = new(
        AllowedDurationsSeconds: [1, 2, 3, 5, 10, 15, 30],
        GuessTimerSeconds: 20,
        MaxExtensionsPerAnswer: 1,
        TracksPerChallenge: 3,
        DurationScores: new() { [1] = 1000, [2] = 850, [3] = 700, [5] = 500, [10] = 300, [15] = 150, [30] = 50 });

    public static AppSettings From(IEnumerable<Setting> rows)
    {
        var map = rows.ToDictionary(s => s.Key, s => s.Value);

        return new AppSettings(
            AllowedDurationsSeconds: ParseIntArray(map, "AllowedDurationsSeconds", Default.AllowedDurationsSeconds),
            GuessTimerSeconds:       ParseInt(map, "GuessTimerSeconds",       Default.GuessTimerSeconds),
            MaxExtensionsPerAnswer:  ParseInt(map, "MaxExtensionsPerAnswer",  Default.MaxExtensionsPerAnswer),
            TracksPerChallenge:      ParseInt(map, "TracksPerChallenge",      Default.TracksPerChallenge),
            DurationScores:          ParseDurationScores(map, "DurationScores", Default.DurationScores));
    }

    private static int ParseInt(Dictionary<string, string> map, string key, int fallback)
    {
        return map.TryGetValue(key, out var raw) && int.TryParse(raw, out var value)
            ? value
            : fallback;
    }

    private static int[] ParseIntArray(Dictionary<string, string> map, string key, int[] fallback)
    {
        if (!map.TryGetValue(key, out var raw))
            return fallback;

        var parsed = raw.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(s => int.TryParse(s.Trim(), out var v) ? (int?)v : null)
            .Where(v => v.HasValue)
            .Select(v => v!.Value)
            .ToArray();

        return parsed.Length > 0 ? parsed : fallback;
    }

    private static Dictionary<int, int> ParseDurationScores(
        Dictionary<string, string> map, string key, Dictionary<int, int> fallback)
    {
        if (!map.TryGetValue(key, out var raw))
            return fallback;

        var result = new Dictionary<int, int>();
        foreach (var entry in raw.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = entry.Trim().Split(':');
            if (parts.Length == 2
                && int.TryParse(parts[0].Trim(), out var duration)
                && int.TryParse(parts[1].Trim(), out var score))
            {
                result[duration] = score;
            }
        }

        return result.Count > 0 ? result : fallback;
    }
}

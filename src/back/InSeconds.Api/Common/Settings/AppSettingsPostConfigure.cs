using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Common.Settings;

public sealed class AppSettingsPostConfigure(IConfiguration configuration)
    : IPostConfigureOptions<AppSettings>
{
    public void PostConfigure(string? name, AppSettings options)
    {
        var section = configuration.GetSection(AppDbConfigurationProvider.SectionPrefix);

        // int[] — CSV : "1,2,3,5"
        var rawDurations = section[nameof(AppSettings.AllowedDurationsSeconds)];
        if (!string.IsNullOrWhiteSpace(rawDurations))
        {
            var parsed = rawDurations
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => int.TryParse(s.Trim(), out var v) ? (int?)v : null)
                .Where(v => v.HasValue)
                .Select(v => v!.Value)
                .ToArray();
            if (parsed.Length > 0)
                options.AllowedDurationsSeconds = parsed;
        }

        // Dictionary<int,int> — "1:1000,2:850,..."
        var rawScores = section[nameof(AppSettings.DurationScores)];
        if (!string.IsNullOrWhiteSpace(rawScores))
        {
            var result = new Dictionary<int, int>();
            foreach (var entry in rawScores.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = entry.Trim().Split(':');
                if (parts.Length == 2
                    && int.TryParse(parts[0].Trim(), out var d)
                    && int.TryParse(parts[1].Trim(), out var s))
                    result[d] = s;
            }
            if (result.Count > 0)
                options.DurationScores = result;
        }
    }
}

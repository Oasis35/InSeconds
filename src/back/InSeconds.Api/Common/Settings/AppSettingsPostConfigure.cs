using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.Common.Settings;

public sealed class AppSettingsPostConfigure(IConfiguration configuration)
    : IPostConfigureOptions<AppSettings>
{
    public void PostConfigure(string? name, AppSettings options)
    {
        var section = configuration.GetSection(AppDbConfigurationProvider.SectionPrefix);

        // decimal[] — CSV : "0.50,1,2,3,5,10,15"
        var rawDurations = section[nameof(AppSettings.AllowedDurationsSeconds)];
        if (!string.IsNullOrWhiteSpace(rawDurations))
        {
            var parsed = rawDurations
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => decimal.TryParse(s.Trim(), System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture, out var v) ? (decimal?)v : null)
                .Where(v => v.HasValue)
                .Select(v => v!.Value)
                .ToArray();
            if (parsed.Length > 0)
                options.AllowedDurationsSeconds = parsed;
        }

        // Dictionary<decimal,int> — "0.50:1000,1:850,..."
        var rawScores = section[nameof(AppSettings.DurationScores)];
        if (!string.IsNullOrWhiteSpace(rawScores))
        {
            var result = new Dictionary<decimal, int>();
            foreach (var entry in rawScores.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = entry.Trim().Split(':');
                if (parts.Length == 2
                    && decimal.TryParse(parts[0].Trim(), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var d)
                    && int.TryParse(parts[1].Trim(), out var s))
                    result[d] = s;
            }
            if (result.Count > 0)
                options.DurationScores = result;
        }
    }
}

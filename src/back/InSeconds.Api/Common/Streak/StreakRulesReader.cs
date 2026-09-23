using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Common.Streak;

/// <summary>
/// Lit à chaud (sans passer par IOptions&lt;AppSettings&gt;, figé au boot) les 3 réglages du
/// gel de série, en une seule requête. Même principe que <see cref="SettingsRawReader"/> :
/// une modification SQL de la table Settings s'applique sans redémarrage.
/// </summary>
public static class StreakRulesReader
{
    private static readonly string[] Keys =
    [
        nameof(AppSettings.StreakFreezeEveryDays),
        nameof(AppSettings.StreakFreezeMax),
        nameof(AppSettings.StreakLostNudgeMinDays),
    ];

    public static async Task<StreakRules> LoadAsync(ApplicationDbContext db, CancellationToken ct)
    {
        var values = await db.Settings
            .AsNoTracking()
            .Where(s => Keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        var defaults = new AppSettings();

        int Get(string key, int fallback) =>
            values.TryGetValue(key, out var raw) && int.TryParse(raw, out var value) ? value : fallback;

        return new StreakRules(
            Get(nameof(AppSettings.StreakFreezeEveryDays), defaults.StreakFreezeEveryDays),
            Get(nameof(AppSettings.StreakFreezeMax), defaults.StreakFreezeMax),
            Get(nameof(AppSettings.StreakLostNudgeMinDays), defaults.StreakLostNudgeMinDays));
    }
}

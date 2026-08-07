using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Common.Settings;

/// <summary>
/// Lecture directe et ponctuelle d'une valeur de la table Settings, sans passer par
/// IOptions&lt;AppSettings&gt; (figé au boot). Usage volontairement limité aux cas où
/// une valeur doit être à jour sans redémarrage.
/// </summary>
public static class SettingsRawReader
{
    public static async Task<int> GetIntAsync(ApplicationDbContext db, string key, int fallback, CancellationToken ct)
    {
        var raw = await db.Settings
            .Where(s => s.Key == key)
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);

        return int.TryParse(raw, out var value) ? value : fallback;
    }
}

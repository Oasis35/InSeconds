using System.Text.Json;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Infrastructure.Settings;

/// <summary>Relit <c>infra.settings</c> dans la configuration.</summary>
public interface ISettingsReloader
{
    void Reload();
}

internal sealed class SettingsReloader(DatabaseSettingsConfigurationSource source) : ISettingsReloader
{
    public void Reload() => source.Provider?.Reload();
}

/// <summary>
/// Écrit un réglage puis relit la configuration : la nouvelle valeur est visible tout de suite par
/// les <c>IOptionsMonitor</c>, sans redémarrage (constat R13 de la relecture du plan v2).
/// </summary>
public sealed class SettingsStore(InSecondsDbContext db, ISettingsReloader reloader, TimeProvider time)
{
    public async Task SetAsync<T>(string key, T value, CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(value);
        var now = time.GetUtcNow();
        var setting = await db.Settings.SingleOrDefaultAsync(s => s.Key == key, cancellationToken);
        if (setting is null)
            db.Settings.Add(new Setting(key, json, now));
        else
            setting.Update(json, now);

        await db.SaveChangesAsync(cancellationToken);
        reloader.Reload();
    }
}

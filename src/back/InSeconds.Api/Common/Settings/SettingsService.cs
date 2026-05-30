using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace InSeconds.Api.Common.Settings;

public sealed class SettingsService(ApplicationDbContext db, IMemoryCache cache)
{
    private const string CacheKey = "app_settings";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    public async Task<AppSettings> GetAsync(CancellationToken ct = default)
    {
        return await cache.GetOrCreateAsync(CacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheTtl;
            var rows = await db.Settings.AsNoTracking().ToListAsync(ct);
            return AppSettings.From(rows);
        }) ?? AppSettings.Default;
    }
}

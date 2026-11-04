using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Players.Persistence;

public sealed class EfPlayerDirectory(InSecondsDbContext db) : IPlayerDirectory
{
    public Task<bool> HasAccountAsync(Guid playerId, CancellationToken ct) =>
        db.Set<Account>().AnyAsync(a => a.PlayerId == playerId, ct);

    public Task<bool> ExistsAsync(Guid playerId, CancellationToken ct) =>
        db.Set<Player>().AsNoTracking().AnyAsync(p => p.Id == playerId, ct);

    public async Task<IReadOnlyList<AccountSummary>> ListAccountsAsync(CancellationToken ct) =>
        await (from a in db.Set<Account>().AsNoTracking()
               join p in db.Set<Player>().AsNoTracking() on a.PlayerId equals p.Id
               orderby p.LastSeenAt == null, p.LastSeenAt descending, p.CreatedAt descending
               select new AccountSummary(a.PlayerId, a.Pseudo, a.Email, p.CreatedAt, p.LastSeenAt, a.IsAdmin))
            .ToListAsync(ct);

    public async Task<IReadOnlyDictionary<Guid, string>> GetPseudosAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(playerIds);
        if (playerIds.Count == 0)
            return new Dictionary<Guid, string>();

        var ids = playerIds.Distinct().ToList();
        return await db.Set<Account>().AsNoTracking()
            .Where(a => ids.Contains(a.PlayerId))
            .ToDictionaryAsync(a => a.PlayerId, a => a.Pseudo, ct);
    }

    public async Task<PlayerBreakdown> GetBreakdownAsync(DateTimeOffset now, CancellationToken ct)
    {
        var since7 = now.AddDays(-7);
        var since30 = now.AddDays(-30);

        var counts = await (from p in db.Set<Player>().AsNoTracking()
                            join a in db.Set<Account>().AsNoTracking() on p.Id equals a.PlayerId into accounts
                            from account in accounts.DefaultIfEmpty()
                            group new { p.LastSeenAt, HasAccount = account != null } by 1 into g
                            select new
                            {
                                Guests = g.Count(x => !x.HasAccount),
                                Registered = g.Count(x => x.HasAccount),
                                Active7 = g.Count(x => x.LastSeenAt >= since7),
                                Active30 = g.Count(x => x.LastSeenAt >= since30),
                            })
            // Un seul groupe au plus : `Single`, car `First` sans `OrderBy` fait journaliser un avertissement à EF Core.
            .SingleOrDefaultAsync(ct);

        return counts is null ? new PlayerBreakdown(0, 0, 0, 0) : new PlayerBreakdown(counts.Guests, counts.Registered, counts.Active7, counts.Active30);
    }

    public Task<int> CountAccountsCreatedOnAsync(DateOnly day, CancellationToken ct)
    {
        var from = new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var to = from.AddDays(1);
        return db.Set<Account>().AsNoTracking().CountAsync(a => a.LinkedAt >= from && a.LinkedAt < to, ct);
    }

    public async Task<IReadOnlyList<ArrivalCount>> CountArrivalsBySourceAsync(DateOnly from, DateOnly to, CancellationToken ct)
    {
        var start = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var end = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var rows = await db.Set<Player>().AsNoTracking()
            .Where(p => p.CreatedAt >= start && p.CreatedAt < end && p.AcquisitionSource != null)
            .GroupBy(p => p.AcquisitionSource!)
            .Select(g => new { Source = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        return rows
            .OrderByDescending(r => r.Count).ThenBy(r => r.Source, StringComparer.Ordinal)
            .Select(r => new ArrivalCount(r.Source, r.Count))
            .ToList();
    }
}

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
        db.Set<Player>().AsNoTracking().AnyAsync(p => p.Id == playerId && p.DeletedAt == null, ct);

    public async Task<IReadOnlyList<AccountSummary>> ListAccountsAsync(CancellationToken ct) =>
        await (from a in db.Set<Account>().AsNoTracking()
               join p in db.Set<Player>().AsNoTracking() on a.PlayerId equals p.Id
               where p.DeletedAt == null
               orderby p.LastSeenAt == null, p.LastSeenAt descending, p.CreatedAt descending
               select new AccountSummary(a.PlayerId, a.Pseudo, a.Email, p.CreatedAt, p.LastSeenAt, a.IsAdmin))
            .ToListAsync(ct);

    public async Task<IReadOnlyDictionary<Guid, string>> GetPseudosAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(playerIds);
        if (playerIds.Count == 0)
            return new Dictionary<Guid, string>();

        var ids = playerIds.Distinct().ToList();
        return await (from a in db.Set<Account>().AsNoTracking()
                      join p in db.Set<Player>().AsNoTracking() on a.PlayerId equals p.Id
                      where p.DeletedAt == null && ids.Contains(a.PlayerId)
                      select new { a.PlayerId, a.Pseudo })
            .ToDictionaryAsync(x => x.PlayerId, x => x.Pseudo, ct);
    }

    public async Task<PlayerBreakdown> GetBreakdownAsync(DateTimeOffset now, CancellationToken ct)
    {
        var since7 = now.AddDays(-7);
        var since30 = now.AddDays(-30);

        var counts = await (from p in db.Set<Player>().AsNoTracking()
                            where p.DeletedAt == null
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
            .FirstOrDefaultAsync(ct);

        return counts is null ? new PlayerBreakdown(0, 0, 0, 0) : new PlayerBreakdown(counts.Guests, counts.Registered, counts.Active7, counts.Active30);
    }
}

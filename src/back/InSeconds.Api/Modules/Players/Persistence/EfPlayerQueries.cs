using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Players.Persistence;

public sealed class EfPlayerQueries(InSecondsDbContext db) : IPlayerQueries
{
    public Task<PlayerMeResponse?> FindMeAsync(Guid playerId, CancellationToken ct) =>
        (from player in db.Set<Player>().AsNoTracking()
         where player.Id == playerId && player.DeletedAt == null
         join account in db.Set<Account>() on player.Id equals account.PlayerId into accounts
         from account in accounts.DefaultIfEmpty()
         select new PlayerMeResponse(
             player.Id,
             account == null,
             account == null ? null : account.Email,
             account == null ? null : account.Pseudo,
             account != null && account.IsAdmin))
        .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<DeviceResponse>> ListDevicesAsync(Guid playerId, int? currentDeviceSessionId, CancellationToken ct) =>
        await db.Set<DeviceSession>().AsNoTracking()
            .Where(s => s.PlayerId == playerId && s.RevokedAt == null)
            .OrderByDescending(s => s.LastSeenAt)
            .Select(s => new DeviceResponse(s.Id, s.UserAgentLabel, s.CreatedAt, s.LastSeenAt, s.Id == currentDeviceSessionId))
            .ToListAsync(ct);

    public async Task<PlayerRecordExport?> ExportAsync(Guid playerId, CancellationToken ct)
    {
        var player = await (
                from p in db.Set<Player>().AsNoTracking()
                where p.Id == playerId && p.DeletedAt == null
                join a in db.Set<Account>() on p.Id equals a.PlayerId into accounts
                from account in accounts.DefaultIfEmpty()
                select new
                {
                    p.CreatedAt,
                    p.LastSeenAt,
                    Account = account == null ? null : new AccountExport(account.Email, account.Pseudo, account.LinkedAt, account.IsAdmin),
                })
            .FirstOrDefaultAsync(ct);
        if (player is null)
            return null;

        var devices = await db.Set<DeviceSession>().AsNoTracking()
            .Where(s => s.PlayerId == playerId)
            .OrderBy(s => s.CreatedAt)
            .Select(s => new DeviceExport(s.UserAgentLabel, s.CreatedAt, s.LastSeenAt, s.RevokedAt))
            .ToListAsync(ct);
        return new PlayerRecordExport(player.CreatedAt, player.LastSeenAt, player.Account, devices);
    }
}

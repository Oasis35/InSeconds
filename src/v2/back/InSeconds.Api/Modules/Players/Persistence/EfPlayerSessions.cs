using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Players.Persistence;

/// <summary>
/// Appareils vus par l'authentification. Appelé hors des handlers Wolverine (validation du cookie,
/// middleware de transition) : ces écritures s'enregistrent elles-mêmes.
/// </summary>
public sealed class EfPlayerSessions(InSecondsDbContext db) : IPlayerSessions
{
    public async Task<DeviceSessionStatus> GetStatusAsync(Guid playerId, int deviceSessionId, CancellationToken ct)
    {
        var row = await (
            from session in db.Set<DeviceSession>().AsNoTracking()
            join player in db.Set<Player>() on session.PlayerId equals player.Id
            where session.Id == deviceSessionId && session.PlayerId == playerId
            select new
            {
                session.RevokedAt,
                session.LastSeenAt,
                player.DeletedAt,
                IsAdmin = db.Set<Account>().Any(a => a.PlayerId == player.Id && a.IsAdmin),
            }).FirstOrDefaultAsync(ct);

        return row is null || row.RevokedAt is not null || row.DeletedAt is not null
            ? DeviceSessionStatus.Inactive
            : new DeviceSessionStatus(IsActive: true, row.IsAdmin, row.LastSeenAt);
    }

    public async Task RecordSeenAsync(Guid playerId, int deviceSessionId, DateTimeOffset now, CancellationToken ct)
    {
        await db.Set<DeviceSession>()
            .Where(s => s.Id == deviceSessionId)
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.LastSeenAt, now), ct);
        await db.Set<Player>()
            .Where(p => p.Id == playerId)
            .ExecuteUpdateAsync(set => set.SetProperty(p => p.LastSeenAt, now), ct);
    }

    public async Task<OpenedDeviceSession?> OpenFromLegacyTokenAsync(Guid legacyAuthToken, DateTimeOffset now, CancellationToken ct)
    {
        var hash = LegacyToken.HashOf(legacyAuthToken);
        var owner = await (
            from token in db.Set<LegacyToken>().AsNoTracking()
            join player in db.Set<Player>() on token.PlayerId equals player.Id
            where token.TokenHash == hash && player.DeletedAt == null
            select new
            {
                player.Id,
                IsAdmin = db.Set<Account>().Any(a => a.PlayerId == player.Id && a.IsAdmin),
            }).FirstOrDefaultAsync(ct);
        if (owner is null)
            return null;

        var session = DeviceSession.Open(owner.Id, now);
        await db.AddAsync(session, ct);
        await db.SaveChangesAsync(ct);
        await db.Set<Player>()
            .Where(p => p.Id == owner.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(p => p.LastSeenAt, now), ct);

        return new OpenedDeviceSession(owner.Id, session.Id, owner.IsAdmin);
    }
}

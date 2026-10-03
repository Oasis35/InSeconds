using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Players.Persistence;

public sealed class EfPlayerStore(InSecondsDbContext db) : IPlayerStore
{
    public void Add(Player player) => db.Add(player);

    public void Add(Account account) => db.Add(account);

    public void Add(AuthToken token) => db.Add(token);

    // AddAsync : la séquence de l'identifiant (HiLo) est lue au besoin, l'identifiant est connu tout de suite.
    public async ValueTask AddAsync(DeviceSession session, CancellationToken ct) => await db.AddAsync(session, ct);

    // email et pseudo sont en citext : comparaisons sans casse, faites par PostgreSQL.
    public Task<AccountLookup?> FindAccountByEmailAsync(string email, CancellationToken ct) =>
        (from account in db.Set<Account>().AsNoTracking()
         join player in db.Set<Player>() on account.PlayerId equals player.Id
         where account.Email == email
         select new AccountLookup(account.PlayerId, account.IsAdmin, player.DeletedAt != null))
        .FirstOrDefaultAsync(ct);

    public Task<bool> IsPseudoTakenAsync(string pseudo, CancellationToken ct) =>
        db.Set<Account>().AnyAsync(a => a.Pseudo == pseudo, ct);

    public Task<bool> HasAccountAsync(Guid playerId, CancellationToken ct) =>
        db.Set<Account>().AnyAsync(a => a.PlayerId == playerId, ct);

    public Task<AuthToken?> FindUsableTokenAsync(AuthTokenPurpose purpose, byte[] tokenHash, DateTimeOffset now, CancellationToken ct) =>
        db.Set<AuthToken>().FirstOrDefaultAsync(
            t => t.TokenHash == tokenHash && t.Purpose == purpose && t.ConsumedAt == null && t.ExpiresAt > now, ct);

    public Task<bool> HasTokenIssuedSinceAsync(AuthTokenPurpose purpose, string email, DateTimeOffset since, CancellationToken ct) =>
        db.Set<AuthToken>().AnyAsync(
            t => t.Purpose == purpose && t.Email == email && t.ConsumedAt == null && t.CreatedAt > since, ct);

    public Task<DeviceSession?> FindDeviceSessionAsync(int id, CancellationToken ct) =>
        db.Set<DeviceSession>().FirstOrDefaultAsync(s => s.Id == id, ct);
}

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

    // FOR UPDATE : de deux vérifications simultanées du même jeton, la seconde attend que la première
    // ait fini ; PostgreSQL relit alors la ligne, déjà consommée, et ne la renvoie plus (usage unique).
    // Pas de composition LINQ derrière FromSql : FOR UPDATE doit rester à la fin de la requête.
    public async Task<AuthToken?> FindUsableTokenAsync(AuthTokenPurpose purpose, byte[] tokenHash, DateTimeOffset now, CancellationToken ct) =>
        (await db.Set<AuthToken>()
            .FromSql($"""
                SELECT * FROM players.auth_tokens
                WHERE token_hash = {tokenHash} AND purpose = {(short)purpose}
                  AND consumed_at IS NULL AND expires_at > {now}
                FOR UPDATE
                """)
            .ToListAsync(ct))
        .SingleOrDefault();

    public Task<bool> HasTokenIssuedSinceAsync(AuthTokenPurpose purpose, string email, DateTimeOffset since, CancellationToken ct) =>
        db.Set<AuthToken>().AnyAsync(
            t => t.Purpose == purpose && t.Email == email && t.ConsumedAt == null && t.CreatedAt > since, ct);

    public Task<DeviceSession?> FindDeviceSessionAsync(int id, CancellationToken ct) =>
        db.Set<DeviceSession>().FirstOrDefaultAsync(s => s.Id == id, ct);

    public Task<Account?> FindAccountAsync(Guid playerId, CancellationToken ct) =>
        (from account in db.Set<Account>()
         join player in db.Set<Player>() on account.PlayerId equals player.Id
         where account.PlayerId == playerId && player.DeletedAt == null
         select account)
        .FirstOrDefaultAsync(ct);

    public Task<bool> IsPseudoTakenByAnotherAsync(string pseudo, Guid playerId, CancellationToken ct) =>
        db.Set<Account>().AnyAsync(a => a.Pseudo == pseudo && a.PlayerId != playerId, ct);

    public Task<bool> HasTokenIssuedForPlayerSinceAsync(AuthTokenPurpose purpose, Guid playerId, DateTimeOffset since, CancellationToken ct) =>
        db.Set<AuthToken>().AnyAsync(
            t => t.Purpose == purpose && t.PlayerId == playerId && t.ConsumedAt == null && t.CreatedAt > since, ct);

    public async Task<IReadOnlyList<DeviceSession>> FindActiveDeviceSessionsAsync(Guid playerId, CancellationToken ct) =>
        await db.Set<DeviceSession>().Where(s => s.PlayerId == playerId && s.RevokedAt == null).ToListAsync(ct);

    // Exécuté tout de suite, dans la transaction ouverte par Wolverine s'il y en a une.
    public Task<int> DeleteLegacyTokenAsync(Guid playerId, CancellationToken ct) =>
        db.Set<LegacyToken>().Where(t => t.PlayerId == playerId).ExecuteDeleteAsync(ct);

    // Exécuté tout de suite, dans la transaction ouverte par Wolverine s'il y en a une.
    public Task<int> DeleteExpiredTokensAsync(DateTimeOffset now, CancellationToken ct) =>
        db.Set<AuthToken>().Where(t => t.ExpiresAt <= now).ExecuteDeleteAsync(ct);
}

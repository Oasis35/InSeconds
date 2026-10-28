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
        db.Set<Account>().AsNoTracking()
            .Where(a => a.Email == email)
            .Select(a => new AccountLookup(a.PlayerId, a.IsAdmin))
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
        db.Set<Account>().FirstOrDefaultAsync(a => a.PlayerId == playerId, ct);

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

    // Exécuté tout de suite, dans la transaction ouverte par Wolverine s'il y en a une.
    public Task<int> DeleteStaleDeviceSessionsAsync(DateTimeOffset cutoff, CancellationToken ct) =>
        db.Set<DeviceSession>().Where(s => s.LastSeenAt < cutoff || s.RevokedAt < cutoff).ExecuteDeleteAsync(ct);

    public async Task<IReadOnlyList<Guid>> ListInactiveAccountsAsync(DateTimeOffset cutoff, CancellationToken ct) =>
        await InactiveAccounts(cutoff).OrderBy(id => id).ToListAsync(ct);

    public Task<bool> IsAccountInactiveAsync(Guid playerId, DateTimeOffset cutoff, CancellationToken ct) =>
        InactiveAccounts(cutoff).AnyAsync(id => id == playerId, ct);

    private IQueryable<Guid> InactiveAccounts(DateTimeOffset cutoff) =>
        from account in db.Set<Account>().AsNoTracking()
        join player in db.Set<Player>() on account.PlayerId equals player.Id
        where !account.IsAdmin && (player.LastSeenAt ?? player.CreatedAt) < cutoff
        select player.Id;

    public async Task<IReadOnlyList<int>> ListDeviceSessionIdsAsync(Guid playerId, CancellationToken ct) =>
        await db.Set<DeviceSession>().Where(s => s.PlayerId == playerId).Select(s => s.Id).ToListAsync(ct);

    // Exécuté tout de suite, dans la transaction de l'appelant. Les jetons de connexion ne portent que l'adresse : ceux de son email
    // partent aussi, avant la suppression du compte qui la donne.
    public async Task EraseAsync(Guid playerId, CancellationToken ct)
    {
        var email = await db.Set<Account>().Where(a => a.PlayerId == playerId).Select(a => a.Email).FirstOrDefaultAsync(ct);
        await db.Set<AuthToken>().Where(t => t.PlayerId == playerId || (email != null && t.Email == email)).ExecuteDeleteAsync(ct);
        await db.Set<LegacyToken>().Where(t => t.PlayerId == playerId).ExecuteDeleteAsync(ct);
        await db.Set<DeviceSession>().Where(s => s.PlayerId == playerId).ExecuteDeleteAsync(ct);
        await db.Set<Account>().Where(a => a.PlayerId == playerId).ExecuteDeleteAsync(ct);
        await db.Set<Player>().Where(p => p.Id == playerId).ExecuteDeleteAsync(ct);
    }
}

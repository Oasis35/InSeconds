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
}

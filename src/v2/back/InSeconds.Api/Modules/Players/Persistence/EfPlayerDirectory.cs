using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Players.Persistence;

public sealed class EfPlayerDirectory(InSecondsDbContext db) : IPlayerDirectory
{
    public Task<bool> HasAccountAsync(Guid playerId, CancellationToken ct) =>
        db.Set<Account>().AnyAsync(a => a.PlayerId == playerId, ct);
}

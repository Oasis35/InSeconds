using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Runs.Persistence;

// Implémentations publiques : Wolverine construit lui-même les dépendances des endpoints (code généré), et refuse une implémentation interne.

public sealed class EfRunsStore(InSecondsDbContext db) : IRunsStore
{
    public Task<bool> CodeExistsAsync(string code, CancellationToken ct) => db.Set<RunChallenge>().AnyAsync(c => c.Code == code, ct);

    public void AddChallenge(RunChallenge challenge) => db.Set<RunChallenge>().Add(challenge);

    public Task<RunAccess?> FindAccessAsync(Guid playerId, CancellationToken ct) =>
        db.Set<RunAccess>().FirstOrDefaultAsync(a => a.PlayerId == playerId, ct);

    public void AddAccess(RunAccess access) => db.Set<RunAccess>().Add(access);

    public void RemoveAccess(RunAccess access) => db.Set<RunAccess>().Remove(access);
}

public sealed class EfRunsQueries(InSecondsDbContext db) : IRunsQueries
{
    public async Task<IReadOnlyList<RunAccessEntry>> ListAccessAsync(CancellationToken ct) =>
        await db.Set<RunAccess>().AsNoTracking().OrderBy(a => a.GrantedAt).ThenBy(a => a.PlayerId)
            .Select(a => new RunAccessEntry(a.PlayerId, a.GrantedAt))
            .ToListAsync(ct);
}

public sealed class EfRunAccess(InSecondsDbContext db, Players.Contracts.ICurrentPlayer current) : IRunAccess
{
    public async Task<bool> CanPlayAsync(Guid playerId, CancellationToken ct) =>
        (current.IsAdmin && current.PlayerId == playerId) || await db.Set<RunAccess>().AnyAsync(a => a.PlayerId == playerId, ct);
}

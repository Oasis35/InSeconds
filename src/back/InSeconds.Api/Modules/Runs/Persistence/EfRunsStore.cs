using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Runs.Persistence;

// Implémentations publiques : Wolverine construit lui-même les dépendances des endpoints (code généré), et refuse une implémentation interne.

public sealed class EfRunsStore(InSecondsDbContext db) : IRunsStore
{
    /// <summary>Premier entier du verrou de démarrage d'une partie (le second est dérivé du joueur) : ne croise aucun autre verrou de l'API.</summary>
    private const int StartLockNamespace = 0x52_53_54_52; // « RSTR »

    /// <summary>Premier entier du verrou du record d'un joueur.</summary>
    private const int RecordLockNamespace = 0x52_52_45_43; // « RREC »

    /// <summary>Premier entier du verrou d'un défi (le second est son identifiant).</summary>
    private const int ChallengeLockNamespace = 0x52_43_48_41; // « RCHA »

    public Task<bool> CodeExistsAsync(string code, CancellationToken ct) => db.Set<RunChallenge>().AnyAsync(c => c.Code == code, ct);

    public void AddChallenge(RunChallenge challenge) => db.Set<RunChallenge>().Add(challenge);

    // hashtext donne un entier de 32 bits à partir de l'identifiant : deux joueurs peuvent partager un verrou (collision rarissime), ils s'attendent
    // alors un instant, sans autre conséquence. Comme EfDailyStore.
    public Task LockPlayerStartAsync(Guid playerId, CancellationToken ct) => LockAsync(StartLockNamespace, playerId, "Le démarrage d'une partie", ct);

    public Task LockRecordAsync(Guid playerId, CancellationToken ct) => LockAsync(RecordLockNamespace, playerId, "La mise à jour d'un record", ct);

    public async Task LockChallengeAsync(RunChallenge challenge, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        RequireTransaction("Le thème d'une manche");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({ChallengeLockNamespace}, {challenge.Id})", ct);
        var entry = db.Entry(challenge);
        if (entry.State != EntityState.Unchanged)
            return;
        // Un autre joueur a pu écrire le thème pendant l'attente du verrou : le défi se relit, et ses morceaux seulement s'ils ont changé.
        var pending = challenge.Rules.PendingThemeRound;
        await entry.ReloadAsync(ct);
        if (challenge.Rules.PendingThemeRound == pending)
            return;
        foreach (var track in challenge.Tracks)
            await db.Entry(track).ReloadAsync(ct);
        foreach (var track in challenge.Reserve)
            await db.Entry(track).ReloadAsync(ct);
    }

    // Un défi ajouté dans cette transaction (le lancement d'un run) n'est pas encore en base : on le trouve d'abord dans le contexte.
    public async Task<RunChallenge?> FindChallengeAsync(string code, CancellationToken ct) =>
        db.Set<RunChallenge>().Local.FirstOrDefault(c => c.Code == code)
        ?? await db.Set<RunChallenge>().Include(c => c.Tracks).Include(c => c.Reserve).AsSplitQuery().FirstOrDefaultAsync(c => c.Code == code, ct);

    public async Task<RunChallenge?> FindChallengeAsync(int challengeId, CancellationToken ct) =>
        db.Set<RunChallenge>().Local.FirstOrDefault(c => c.Id == challengeId)
        ?? await db.Set<RunChallenge>().Include(c => c.Tracks).Include(c => c.Reserve).AsSplitQuery()
            .FirstOrDefaultAsync(c => c.Id == challengeId, ct);

    public Task<RunSession?> FindSessionAsync(int challengeId, Guid playerId, CancellationToken ct) =>
        db.Set<RunSession>().Include(s => s.Answers).Include(s => s.Rounds).Include(s => s.Cards).AsSplitQuery()
            .FirstOrDefaultAsync(s => s.ChallengeId == challengeId && s.PlayerId == playerId, ct);

    public async Task<RunSession?> FindSessionForUpdateAsync(int sessionId, Guid playerId, CancellationToken ct)
    {
        RequireTransaction("La lecture d'une partie à modifier");
        // FOR UPDATE doit rester à la fin de la requête : pas de composition (Include) derrière FromSql. Les réponses et les manches
        // se chargent à part, EF les rattache à la partie.
        var session = (await db.Set<RunSession>()
                .FromSql($"SELECT * FROM runs.sessions WHERE id = {sessionId} AND player_id = {playerId} FOR UPDATE")
                .ToListAsync(ct))
            .SingleOrDefault();
        if (session is not null)
        {
            await db.Set<RunAnswer>().Where(a => a.SessionId == sessionId).LoadAsync(ct);
            await db.Set<RunSessionRound>().Where(r => r.SessionId == sessionId).LoadAsync(ct);
            await db.Set<RunSessionCard>().Where(c => c.SessionId == sessionId).LoadAsync(ct);
        }

        return session;
    }

    public Task<RunSession?> ReadSessionAsync(int sessionId, Guid playerId, CancellationToken ct) =>
        db.Set<RunSession>().AsNoTracking().Include(s => s.Answers).Include(s => s.Rounds).Include(s => s.Cards).AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.PlayerId == playerId, ct);

    public async ValueTask AddAsync(RunSession session, CancellationToken ct) => await db.AddAsync(session, ct);

    public async Task<RunRecord?> FindRecordAsync(Guid playerId, CancellationToken ct) =>
        db.Set<RunRecord>().Local.FirstOrDefault(r => r.PlayerId == playerId)
        ?? await db.Set<RunRecord>().FirstOrDefaultAsync(r => r.PlayerId == playerId, ct);

    public void AddRecord(RunRecord record) => db.Set<RunRecord>().Add(record);

    public async Task<RunLevel?> FindLevelAsync(Guid playerId, CancellationToken ct) =>
        db.Set<RunLevel>().Local.FirstOrDefault(l => l.PlayerId == playerId)
        ?? await db.Set<RunLevel>().FirstOrDefaultAsync(l => l.PlayerId == playerId, ct);

    public void AddLevel(RunLevel level) => db.Set<RunLevel>().Add(level);

    public Task<RunAccess?> FindAccessAsync(Guid playerId, CancellationToken ct) =>
        db.Set<RunAccess>().FirstOrDefaultAsync(a => a.PlayerId == playerId, ct);

    public void AddAccess(RunAccess access) => db.Set<RunAccess>().Add(access);

    public void RemoveAccess(RunAccess access) => db.Set<RunAccess>().Remove(access);

    private async Task LockAsync(int lockNamespace, Guid playerId, string what, CancellationToken ct)
    {
        RequireTransaction(what);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({lockNamespace}, hashtext({playerId.ToString()}))", ct);
    }

    // Un verrou « de transaction » est relâché dès la fin d'une requête hors transaction : il ne protégerait rien.
    private void RequireTransaction(string what)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException($"{what} doit tourner dans une transaction.");
    }
}

public sealed class EfRunsQueries(InSecondsDbContext db) : IRunsQueries
{
    public async Task<IReadOnlyList<RunAccessEntry>> ListAccessAsync(CancellationToken ct) =>
        await db.Set<RunAccess>().AsNoTracking().OrderBy(a => a.GrantedAt).ThenBy(a => a.PlayerId)
            .Select(a => new RunAccessEntry(a.PlayerId, a.GrantedAt))
            .ToListAsync(ct);

    public Task<RunSessionEntry?> FindPendingSessionAsync(Guid playerId, CancellationToken ct) =>
        (from session in db.Set<RunSession>().AsNoTracking()
         join challenge in db.Set<RunChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
         where session.PlayerId == playerId && session.Status == RunSessionStatus.Pending
         orderby session.StartedAt descending, session.Id descending
         select new RunSessionEntry(session.Id, challenge.Code, session.Status))
        .FirstOrDefaultAsync(ct);

    public Task<RunSessionEntry?> FindSessionAsync(int challengeId, Guid playerId, CancellationToken ct) =>
        (from session in db.Set<RunSession>().AsNoTracking()
         join challenge in db.Set<RunChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
         where session.PlayerId == playerId && session.ChallengeId == challengeId
         select new RunSessionEntry(session.Id, challenge.Code, session.Status))
        .FirstOrDefaultAsync(ct);

    public Task<RunRecord?> FindRecordAsync(Guid playerId, CancellationToken ct) =>
        db.Set<RunRecord>().AsNoTracking().FirstOrDefaultAsync(r => r.PlayerId == playerId, ct);

    public Task<RunLevel?> FindLevelAsync(Guid playerId, CancellationToken ct) =>
        db.Set<RunLevel>().AsNoTracking().FirstOrDefaultAsync(l => l.PlayerId == playerId, ct);

    public async Task<IReadOnlyDictionary<int, int>?> FindFinishedPointsAsync(int challengeId, Guid playerId, CancellationToken ct)
    {
        var answers = await db.Set<RunSession>().AsNoTracking()
            .Where(s => s.ChallengeId == challengeId && s.PlayerId == playerId && (s.Status == RunSessionStatus.Won || s.Status == RunSessionStatus.Lost))
            .Select(s => s.Answers.Select(a => new { a.Position, a.Points }).ToList())
            .FirstOrDefaultAsync(ct);
        return answers?.ToDictionary(a => (int)a.Position, a => a.Points);
    }

    public async Task<IReadOnlyDictionary<int, int>> CountFinishedRunsAsync(Guid playerId, CancellationToken ct) =>
        await db.Set<RunSession>().AsNoTracking()
            .Where(s => s.PlayerId == playerId && (s.Status == RunSessionStatus.Won || s.Status == RunSessionStatus.Lost))
            .GroupBy(s => s.RoundsPassed)
            .Select(g => new { RoundsPassed = (int)g.Key, Count = g.Count() })
            .ToDictionaryAsync(e => e.RoundsPassed, e => e.Count, ct);

    public async Task<IReadOnlyList<RunSession>> ListFinishedSessionsAsync(int challengeId, CancellationToken ct) =>
        await db.Set<RunSession>().AsNoTracking().Include(s => s.Answers).Include(s => s.Rounds).Include(s => s.Cards).AsSplitQuery()
            .Where(s => s.ChallengeId == challengeId && (s.Status == RunSessionStatus.Won || s.Status == RunSessionStatus.Lost))
            .ToListAsync(ct);
}

public sealed class EfRunAccess(InSecondsDbContext db, Players.Contracts.ICurrentPlayer current) : IRunAccess
{
    public async Task<bool> CanPlayAsync(Guid playerId, CancellationToken ct) =>
        (current.IsAdmin && current.PlayerId == playerId) || await db.Set<RunAccess>().AnyAsync(a => a.PlayerId == playerId, ct);
}

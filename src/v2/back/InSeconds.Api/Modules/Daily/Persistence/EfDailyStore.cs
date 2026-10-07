using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

public sealed class EfDailyStore(InSecondsDbContext db) : IDailyStore
{
    /// <summary>Premier entier du verrou de génération (le second est le numéro du jour) : ne croise aucun autre verrou de l'API.</summary>
    private const int GenerationLockNamespace = 0x44_41_49_4C; // « DAIL »

    /// <summary>Premier entier du verrou de démarrage d'une partie (le second est dérivé du joueur).</summary>
    private const int StartLockNamespace = 0x44_53_54_52; // « DSTR »

    public async Task LockGenerationAsync(DateOnly day, CancellationToken ct)
    {
        RequireTransaction("La génération d'un défi");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({GenerationLockNamespace}, {day.DayNumber})", ct);
    }

    public async Task LockPlayerStartAsync(Guid playerId, CancellationToken ct)
    {
        RequireTransaction("Le démarrage d'une partie");
        // hashtext donne un entier de 32 bits à partir de l'identifiant : deux joueurs peuvent partager un verrou (collision rarissime),
        // ils s'attendent alors un instant, sans autre conséquence.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock({StartLockNamespace}, hashtext({playerId.ToString()}))", ct);
    }

    // Le défi qu'une génération vient d'ajouter dans cette transaction n'est pas encore en base : on le trouve d'abord dans le contexte.
    public async Task<DailyChallenge?> FindChallengeAsync(DateOnly day, CancellationToken ct) =>
        db.Set<DailyChallenge>().Local.FirstOrDefault(c => c.Date == day)
        ?? await db.Set<DailyChallenge>().Include(c => c.Tracks).FirstOrDefaultAsync(c => c.Date == day, ct);

    public Task<DailyChallenge?> FindChallengeAsync(int challengeId, CancellationToken ct) =>
        db.Set<DailyChallenge>().Include(c => c.Tracks).FirstOrDefaultAsync(c => c.Id == challengeId, ct);

    public async ValueTask AddAsync(DailyChallenge challenge, CancellationToken ct) => await db.AddAsync(challenge, ct);

    public async Task ExpireStaleSessionsAsync(Guid playerId, DateOnly today, DateTimeOffset now, CancellationToken ct)
    {
        var stale = await db.Set<DailySession>()
            .Where(s => s.PlayerId == playerId && s.Status == SessionStatus.Pending
                && db.Set<DailyChallenge>().Any(c => c.Id == s.ChallengeId && c.Date < today))
            .ToListAsync(ct);
        foreach (var session in stale)
            session.Expire(now);
    }

    public Task<DailySession?> FindSessionAsync(Guid playerId, int challengeId, CancellationToken ct) =>
        db.Set<DailySession>().Include(s => s.Answers).FirstOrDefaultAsync(s => s.PlayerId == playerId && s.ChallengeId == challengeId, ct);

    public async Task<DailySession?> FindSessionForUpdateAsync(int sessionId, CancellationToken ct)
    {
        // FOR UPDATE doit rester à la fin de la requête : pas de composition (Include) derrière FromSql. Les réponses se chargent à part, EF
        // les rattache à la partie.
        var session = (await db.Set<DailySession>()
                .FromSql($"SELECT * FROM daily.sessions WHERE id = {sessionId} FOR UPDATE")
                .ToListAsync(ct))
            .SingleOrDefault();
        if (session is not null)
            await db.Set<SessionAnswer>().Where(a => a.SessionId == sessionId).LoadAsync(ct);
        return session;
    }

    public async ValueTask AddAsync(DailySession session, CancellationToken ct) => await db.AddAsync(session, ct);

    // Une série ajoutée plus tôt dans la même transaction (gel offert à la création du compte) n'est pas encore en base.
    public async Task<DailyStreak?> FindStreakAsync(Guid playerId, CancellationToken ct) =>
        db.Set<DailyStreak>().Local.FirstOrDefault(s => s.PlayerId == playerId)
        ?? await db.Set<DailyStreak>().FirstOrDefaultAsync(s => s.PlayerId == playerId, ct);

    public void Add(DailyStreak streak) => db.Add(streak);

    // Un verrou « de transaction » est relâché dès la fin d'une requête hors transaction : il ne protégerait rien.
    private void RequireTransaction(string what)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException($"{what} doit tourner dans une transaction.");
    }
}

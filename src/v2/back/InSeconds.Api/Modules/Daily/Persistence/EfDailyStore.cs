using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

public sealed class EfDailyStore(InSecondsDbContext db) : IDailyStore
{
    /// <summary>Premier entier du verrou de génération (le second est le numéro du jour) : ne croise aucun autre verrou de l'API.</summary>
    private const int GenerationLockNamespace = 0x44_41_49_4C; // « DAIL »

    public async Task LockGenerationAsync(DateOnly day, CancellationToken ct)
    {
        // Un verrou « de transaction » est relâché dès la fin d'une requête hors transaction : il ne protégerait rien.
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("La génération d'un défi doit tourner dans une transaction.");

        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({GenerationLockNamespace}, {day.DayNumber})", ct);
    }

    public Task<DailyChallenge?> FindChallengeAsync(DateOnly day, CancellationToken ct) =>
        db.Set<DailyChallenge>().Include(c => c.Tracks).FirstOrDefaultAsync(c => c.Date == day, ct);

    public async ValueTask AddAsync(DailyChallenge challenge, CancellationToken ct) => await db.AddAsync(challenge, ct);
}

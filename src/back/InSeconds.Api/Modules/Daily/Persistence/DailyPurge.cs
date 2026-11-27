using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>Ce que la purge compte (simulation) ou a supprimé (application) ; jamais un nom, un identifiant de joueur ou une saisie.</summary>
public sealed record DailyPurgeReport(
    DateOnly Before, int Challenges, int ChallengeTracks, int DayStats, int Sessions, int Answers, int Players,
    int StreaksKept, int StreaksChanged, int StreaksRemoved, bool Applied);

/// <summary>
/// Efface les jours de défi d'avant une date (strictement) : réponses, parties, photos de statistiques, morceaux de défi et défis, puis
/// rejoue chaque série depuis les seuls jours restants (<see cref="StreakReplay"/>). Appelée par <c>--purge-daily-before</c>, jamais par l'API.
/// La date est celle du défi (piège 18), jamais l'heure de complétion. Une seule transaction, sous un verrou consultatif : une purge à la fois,
/// rejouable (rien à supprimer, séries déjà rejouées : aucun changement). La table des séries est verrouillée en écriture pendant la transaction.
/// </summary>
public sealed class DailyPurge(InSecondsDbContext db, IPlayerDirectory players)
{
    /// <summary>Premier entier du verrou de la purge (le second est 0) : ne croise aucun autre verrou de l'API.</summary>
    private const int PurgeLockNamespace = 0x44_50_52_47; // « DPRG »

    public async Task<DailyPurgeReport> RunAsync(DateOnly before, StreakRules rules, bool apply, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({PurgeLockNamespace}, 0)", ct);

        // Les séries sont lues puis réécrites : on bloque les écritures de `daily.streaks` (une partie qui se termine attend la fin de la purge),
        // sinon le rejeu écraserait une série mise à jour entre la lecture et l'enregistrement. Les lectures continuent.
        await db.Database.ExecuteSqlRawAsync("LOCK TABLE daily.streaks IN SHARE ROW EXCLUSIVE MODE", ct);

        var challenges = db.Set<DailyChallenge>().Where(c => c.Date < before);
        var sessions = db.Set<DailySession>().Where(s => challenges.Any(c => c.Id == s.ChallengeId));

        var challengeCount = await challenges.CountAsync(ct);
        var trackCount = await db.Set<ChallengeTrack>().CountAsync(t => challenges.Any(c => c.Id == t.ChallengeId), ct);
        var statsCount = await db.Set<DayStatsSnapshot>().CountAsync(s => challenges.Any(c => c.Id == s.ChallengeId), ct);
        var sessionCount = await sessions.CountAsync(ct);
        var answerCount = await db.Set<SessionAnswer>().CountAsync(a => sessions.Any(s => s.Id == a.SessionId), ct);
        var playerCount = await sessions.Select(s => s.PlayerId).Distinct().CountAsync(ct);

        if (apply)
        {
            // Les réponses partent avec leur partie (cascade), les photos et morceaux de défi avec leur défi : l'ordre sert surtout les clés
            // étrangères en RESTRICT (une partie garde son défi).
            await db.Set<SessionAnswer>().Where(a => sessions.Any(s => s.Id == a.SessionId)).ExecuteDeleteAsync(ct);
            await sessions.ExecuteDeleteAsync(ct);
            await db.Set<DayStatsSnapshot>().Where(s => challenges.Any(c => c.Id == s.ChallengeId)).ExecuteDeleteAsync(ct);
            await db.Set<ChallengeTrack>().Where(t => challenges.Any(c => c.Id == t.ChallengeId)).ExecuteDeleteAsync(ct);
            await challenges.ExecuteDeleteAsync(ct);
        }

        // Séries : rejouées depuis les parties qui restent (en simulation, depuis celles qui resteraient).
        var remaining = await (
                from session in db.Set<DailySession>().AsNoTracking()
                join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                where session.Status == SessionStatus.Completed && challenge.Date >= before
                select new { session.PlayerId, challenge.Date })
            .ToListAsync(ct);
        var daysByPlayer = remaining.GroupBy(r => r.PlayerId).ToDictionary(g => g.Key, g => g.Select(r => r.Date).ToList());

        var stored = await db.Set<DailyStreak>().ToListAsync(ct);
        int kept = 0, changed = 0, removed = 0;
        foreach (var current in stored)
        {
            DailyStreak? replayed = null;
            if (daysByPlayer.TryGetValue(current.PlayerId, out var days))
                replayed = StreakReplay.Run(current.PlayerId, days, await players.HasAccountAsync(current.PlayerId, ct), rules);

            if (replayed is null)
            {
                removed++;
                if (apply)
                    db.Remove(current);
            }
            else if (Same(current, replayed))
            {
                kept++;
            }
            else
            {
                changed++;
                if (apply)
                    db.Entry(current).CurrentValues.SetValues(new
                    {
                        replayed.CurrentStreak,
                        replayed.LastPlayedDate,
                        replayed.Freezes,
                        replayed.BestStreak,
                    });
            }
        }

        if (apply)
        {
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }

        return new DailyPurgeReport(
            before, challengeCount, trackCount, statsCount, sessionCount, answerCount, playerCount, kept, changed, removed, apply);
    }

    // Un joueur qui a une partie terminée mais pas de ligne de série n'en reçoit pas : elle n'existe qu'à la complétion en jeu, et le
    // rejeu ne crée rien de plus que la règle (une série existante par joueur ayant terminé un défi).
    private static bool Same(DailyStreak a, DailyStreak b) =>
        a.CurrentStreak == b.CurrentStreak && a.LastPlayedDate == b.LastPlayedDate && a.Freezes == b.Freezes && a.BestStreak == b.BestStreak;
}

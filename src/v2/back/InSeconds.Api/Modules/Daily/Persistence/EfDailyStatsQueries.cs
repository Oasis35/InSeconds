using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>Les parties et les réponses des joueurs qui existent encore (R8) : ce que toute statistique lit.</summary>
internal static class LiveData
{
    /// <summary>
    /// Les parties des joueurs non supprimés. Daily ne peut pas utiliser le type des joueurs (règle d'architecture) : la jointure sur
    /// <c>players.players</c> est écrite en SQL, en lecture seule, et la requête reste composable.
    /// </summary>
    public static IQueryable<DailySession> Sessions(InSecondsDbContext db) =>
        db.Set<DailySession>().FromSql(
            $"SELECT s.* FROM daily.sessions s JOIN players.players p ON p.id = s.player_id WHERE p.deleted_at IS NULL").AsNoTracking();

    public static IQueryable<SessionAnswer> Answers(InSecondsDbContext db, int challengeId, bool completedOnly)
    {
        var sessions = Sessions(db).Where(s => s.ChallengeId == challengeId && (!completedOnly || s.Status == SessionStatus.Completed));
        return db.Set<SessionAnswer>().AsNoTracking().Where(a => sessions.Any(s => s.Id == a.SessionId));
    }
}

public sealed class EfDailyStatsQueries(InSecondsDbContext db) : IDailyStatsQueries
{
    public async Task<IReadOnlyList<ChallengeTrackRef>> GetChallengeTracksAsync(int challengeId, CancellationToken ct) =>
        await db.Set<ChallengeTrack>().AsNoTracking()
            .Where(t => t.ChallengeId == challengeId)
            .OrderBy(t => t.Position)
            .Select(t => new ChallengeTrackRef(t.Position, t.TrackId))
            .ToListAsync(ct);

    public async Task<PlayerSessionRow?> GetPlayerSessionAsync(int challengeId, Guid playerId, CancellationToken ct)
    {
        var session = await db.Set<DailySession>().AsNoTracking()
            .Where(s => s.ChallengeId == challengeId && s.PlayerId == playerId)
            .Select(s => new { s.Id, s.Status, s.TotalScore, s.FreezesUsed, s.FreezeEarned })
            .FirstOrDefaultAsync(ct);
        if (session is null)
            return null;

        var answers = session.Status == SessionStatus.Completed
            ? await db.Set<SessionAnswer>().AsNoTracking()
                .Where(a => a.SessionId == session.Id)
                .OrderBy(a => a.Position)
                .Select(a => new PlayerAnswerRow(a.Position, a.ArtistCorrect, a.TitleCorrect, a.ListenedSeconds, a.Score))
                .ToListAsync(ct)
            : [];
        return new PlayerSessionRow(session.Status, session.TotalScore, session.FreezesUsed, session.FreezeEarned, answers);
    }

    public async Task<IReadOnlyList<DaySessionRow>> GetSessionsAsync(int challengeId, CancellationToken ct) =>
        await LiveData.Sessions(db)
            .Where(s => s.ChallengeId == challengeId)
            .OrderBy(s => s.Id)
            .Select(s => new DaySessionRow(s.PlayerId, s.Status, s.TotalScore))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<int>> GetCompletedScoresAsync(int challengeId, CancellationToken ct) =>
        await LiveData.Sessions(db)
            .Where(s => s.ChallengeId == challengeId && s.Status == SessionStatus.Completed)
            .Select(s => s.TotalScore)
            .ToListAsync(ct);

    public async Task<IReadOnlyDictionary<int, TrackAggregate>> GetTrackAggregatesAsync(int challengeId, bool completedOnly, CancellationToken ct)
    {
        var answers = LiveData.Answers(db, challengeId, completedOnly);

        var totals = await answers
            .GroupBy(a => a.Position)
            .Select(g => new
            {
                Position = (int)g.Key,
                Total = g.Count(),
                ArtistCorrect = g.Count(a => a.ArtistCorrect),
                TitleCorrect = g.Count(a => a.TitleCorrect),
                Found = g.Count(a => a.ArtistCorrect || a.TitleCorrect),
                Extended = g.Count(a => a.WasExtended),
                ListenedSum = g.Sum(a => a.ListenedSeconds),
                FoundListenedSum = g.Where(a => a.ArtistCorrect || a.TitleCorrect).Sum(a => a.ListenedSeconds),
            })
            .ToListAsync(ct);

        // « En combien de temps les autres ont trouvé » : les réponses trouvées, par palier d'écoute.
        var byDuration = (await answers
                .Where(a => a.ArtistCorrect || a.TitleCorrect)
                .GroupBy(a => new { a.Position, a.ListenedSeconds })
                .Select(g => new { Position = (int)g.Key.Position, Seconds = g.Key.ListenedSeconds, Count = g.Count() })
                .ToListAsync(ct))
            .GroupBy(x => x.Position)
            .ToDictionary(g => g.Key, g => (IReadOnlyDictionary<decimal, int>)g.ToDictionary(x => x.Seconds, x => x.Count));

        return totals.ToDictionary(
            t => t.Position,
            t => new TrackAggregate(
                t.Position, t.Total, t.ArtistCorrect, t.TitleCorrect, t.Found, t.Extended, t.ListenedSum, t.FoundListenedSum,
                byDuration.GetValueOrDefault(t.Position) ?? new Dictionary<decimal, int>()));
    }

    public async Task<IReadOnlyList<UnfrozenChallenge>> ListUnfrozenChallengesAsync(DateOnly upTo, CancellationToken ct) =>
        await db.Set<DailyChallenge>().AsNoTracking()
            .Where(c => c.Date <= upTo && !db.Set<DayStatsSnapshot>().Any(s => s.ChallengeId == c.Id))
            .OrderBy(c => c.Date)
            .Select(c => new UnfrozenChallenge(c.Id, c.Date))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<TrackTally>> GetTrackTalliesAsync(DateOnly fromDay, DateOnly toDay, CancellationToken ct)
    {
        var sessions = LiveData.Sessions(db);
        var rows =
            from a in db.Set<SessionAnswer>().AsNoTracking()
            join s in sessions on a.SessionId equals s.Id
            join c in db.Set<DailyChallenge>().AsNoTracking() on s.ChallengeId equals c.Id
            join t in db.Set<ChallengeTrack>().AsNoTracking() on new { ChallengeId = c.Id, a.Position } equals new { t.ChallengeId, t.Position }
            where c.Date >= fromDay && c.Date <= toDay
            select new { t.TrackId, a.ArtistCorrect, a.TitleCorrect };

        return await rows
            .GroupBy(r => r.TrackId)
            .Select(g => new TrackTally(g.Key, g.Count(), g.Count(r => r.ArtistCorrect && r.TitleCorrect)))
            .ToListAsync(ct);
    }
}

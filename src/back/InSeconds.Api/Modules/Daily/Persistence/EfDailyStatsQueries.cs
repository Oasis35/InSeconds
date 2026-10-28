using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>
/// Les réponses d'un défi, que lit toute statistique d'un morceau. Celles d'un joueur effacé n'y sont plus : l'effacement supprime ses
/// parties (R8, <c>AccountErasure</c>).
/// </summary>
internal static class ChallengeAnswers
{
    public static IQueryable<SessionAnswer> Of(InSecondsDbContext db, int challengeId, bool completedOnly)
    {
        var sessions = db.Set<DailySession>().AsNoTracking()
            .Where(s => s.ChallengeId == challengeId && (!completedOnly || s.Status == SessionStatus.Completed));
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

    public Task<int> CountCompletedSessionsAsync(CancellationToken ct) =>
        db.Set<DailySession>().AsNoTracking().CountAsync(s => s.Status == SessionStatus.Completed, ct);

    public async Task<IReadOnlyList<DaySessionRow>> GetSessionsAsync(int challengeId, CancellationToken ct) =>
        await db.Set<DailySession>().AsNoTracking()
            .Where(s => s.ChallengeId == challengeId)
            .OrderBy(s => s.Id)
            .Select(s => new DaySessionRow(s.PlayerId, s.Status, s.TotalScore))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<int>> GetCompletedScoresAsync(int challengeId, CancellationToken ct) =>
        await db.Set<DailySession>().AsNoTracking()
            .Where(s => s.ChallengeId == challengeId && s.Status == SessionStatus.Completed)
            .Select(s => s.TotalScore)
            .ToListAsync(ct);

    public async Task<IReadOnlyDictionary<int, TrackAggregate>> GetTrackAggregatesAsync(int challengeId, bool completedOnly, CancellationToken ct)
    {
        var answers = ChallengeAnswers.Of(db, challengeId, completedOnly);

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

    public async Task<IReadOnlyList<RecentChallenge>> ListRecentChallengesAsync(int take, CancellationToken ct) =>
        await (from c in db.Set<DailyChallenge>().AsNoTracking()
               join s in db.Set<DayStatsSnapshot>().AsNoTracking() on c.Id equals s.ChallengeId into snapshots
               from snapshot in snapshots.DefaultIfEmpty()
               orderby c.Date descending
               select new RecentChallenge(c.Id, c.Date, snapshot == null ? null : snapshot.Payload, snapshot == null ? null : snapshot.ComputedAt))
            .Take(take)
            .ToListAsync(ct);

    public async Task<RecentChallenge?> FindChallengeWithSnapshotAsync(DateOnly day, CancellationToken ct) =>
        await (from c in db.Set<DailyChallenge>().AsNoTracking()
               join s in db.Set<DayStatsSnapshot>().AsNoTracking() on c.Id equals s.ChallengeId into snapshots
               from snapshot in snapshots.DefaultIfEmpty()
               where c.Date == day
               select new RecentChallenge(c.Id, c.Date, snapshot == null ? null : snapshot.Payload, snapshot == null ? null : snapshot.ComputedAt))
            .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<ChallengeListRow>> ListChallengesAsync(CancellationToken ct)
    {
        var rows = await db.Set<DailyChallenge>().AsNoTracking()
            .OrderByDescending(c => c.Date)
            .Select(c => new { c.Id, c.Date, Tracks = c.Tracks.OrderBy(t => t.Position).Select(t => new ChallengeTrackRef(t.Position, t.TrackId)).ToList() })
            .ToListAsync(ct);
        return rows.Select(r => new ChallengeListRow(r.Id, r.Date, r.Tracks)).ToList();
    }

    public async Task<IReadOnlyList<DateOnly>> ListChallengeDatesAsync(CancellationToken ct) =>
        await db.Set<DailyChallenge>().AsNoTracking().OrderByDescending(c => c.Date).Select(c => c.Date).ToListAsync(ct);

    public async Task<int?> FindChallengeIdAsync(DateOnly day, CancellationToken ct) =>
        await db.Set<DailyChallenge>().AsNoTracking().Where(c => c.Date == day).Select(c => (int?)c.Id).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyDictionary<DateOnly, int>> GetCompletedCountsByDayAsync(DateOnly since, CancellationToken ct) =>
        await (from s in db.Set<DailySession>().AsNoTracking()
               join c in db.Set<DailyChallenge>().AsNoTracking() on s.ChallengeId equals c.Id
               where c.Date >= since && s.Status == SessionStatus.Completed
               group s by c.Date into g
               select new { Date = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Date, x => x.Count, ct);

    public async Task<IReadOnlyDictionary<Guid, int>> GetCompletedCountsByPlayerAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(playerIds);
        if (playerIds.Count == 0)
            return new Dictionary<Guid, int>();

        var ids = playerIds.Distinct().ToList();
        return await db.Set<DailySession>().AsNoTracking()
            .Where(s => s.Status == SessionStatus.Completed && ids.Contains(s.PlayerId))
            .GroupBy(s => s.PlayerId)
            .Select(g => new { PlayerId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.PlayerId, x => x.Count, ct);
    }

    public async Task<int?> GetBestScoreAsync(Guid playerId, CancellationToken ct) =>
        await db.Set<DailySession>().AsNoTracking()
            .Where(s => s.PlayerId == playerId && s.Status == SessionStatus.Completed)
            .MaxAsync(s => (int?)s.TotalScore, ct);

    public async Task<IReadOnlyDictionary<Guid, StreakRow>> GetStreaksAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(playerIds);
        if (playerIds.Count == 0)
            return new Dictionary<Guid, StreakRow>();

        var ids = playerIds.Distinct().ToList();
        return await db.Set<DailyStreak>().AsNoTracking()
            .Where(s => ids.Contains(s.PlayerId))
            .Select(s => new { s.PlayerId, Row = new StreakRow(s.CurrentStreak, s.LastPlayedDate, s.Freezes) })
            .ToDictionaryAsync(x => x.PlayerId, x => x.Row, ct);
    }

    public async Task<IReadOnlyList<PlayerHistoryRow>> GetPlayerHistoryAsync(Guid playerId, DateOnly since, CancellationToken ct) =>
        await (from s in db.Set<DailySession>().AsNoTracking()
               join c in db.Set<DailyChallenge>().AsNoTracking() on s.ChallengeId equals c.Id
               where s.PlayerId == playerId && c.Date >= since
               orderby c.Date descending
               select new PlayerHistoryRow(c.Date, s.Status, s.TotalScore, s.FreezesUsed, s.FreezeEarned))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<TrackTally>> GetTrackTalliesAsync(DateOnly fromDay, DateOnly toDay, CancellationToken ct)
    {
        var rows =
            from a in db.Set<SessionAnswer>().AsNoTracking()
            join s in db.Set<DailySession>().AsNoTracking() on a.SessionId equals s.Id
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

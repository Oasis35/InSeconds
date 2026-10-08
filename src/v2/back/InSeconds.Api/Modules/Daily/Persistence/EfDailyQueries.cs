using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

public sealed class EfDailyQueries(InSecondsDbContext db) : IDailyQueries
{
    public async Task<TodayRow?> GetTodayAsync(DateOnly day, Guid? playerId, CancellationToken ct)
    {
        var challenge = await db.Set<DailyChallenge>().AsNoTracking()
            .Where(c => c.Date == day)
            .Select(c => new { c.Id, TracksCount = c.Tracks.Count })
            .FirstOrDefaultAsync(ct);
        if (challenge is null)
            return null;
        if (playerId is not { } id)
            return new TodayRow(challenge.Id, challenge.TracksCount, null, 0, null);

        var session = await db.Set<DailySession>().AsNoTracking()
            .Where(s => s.PlayerId == id && s.ChallengeId == challenge.Id)
            .Select(s => new { s.Status, AnswerCount = s.Answers.Count })
            .FirstOrDefaultAsync(ct);
        var streak = await db.Set<DailyStreak>().AsNoTracking()
            .Where(s => s.PlayerId == id)
            .Select(s => new StreakRow(s.CurrentStreak, s.LastPlayedDate, s.Freezes))
            .FirstOrDefaultAsync(ct);

        return new TodayRow(challenge.Id, challenge.TracksCount, session?.Status, session?.AnswerCount ?? 0, streak);
    }

    public async Task<PriorAnswerStats> GetPriorAnswerStatsAsync(int challengeId, int position, CancellationToken ct)
    {
        var answers = db.Set<SessionAnswer>().AsNoTracking()
            .Where(a => a.Position == position
                && db.Set<DailySession>().Any(s => s.Id == a.SessionId && s.ChallengeId == challengeId));

        var totals = await answers
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Total = g.Count(),
                Found = g.Count(a => a.ArtistCorrect || a.TitleCorrect),
                FoundSeconds = g.Where(a => a.ArtistCorrect || a.TitleCorrect).Sum(a => (decimal?)a.ListenedSeconds),
            })
            .FirstOrDefaultAsync(ct);
        if (totals is null)
            return PriorAnswerStats.None;

        var byDuration = await answers
            .Where(a => a.ArtistCorrect || a.TitleCorrect)
            .GroupBy(a => a.ListenedSeconds)
            .Select(g => new { Seconds = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        return new PriorAnswerStats(
            totals.Total, totals.Found, totals.FoundSeconds ?? 0, totals.Total - totals.Found, byDuration.ToDictionary(x => x.Seconds, x => x.Count));
    }
}

using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>L'historique d'un joueur : ses parties, jamais celles d'un autre (tout part de son identifiant).</summary>
public sealed class EfDailyHistoryQueries(InSecondsDbContext db) : IDailyHistoryQueries
{
    public async Task<IReadOnlyList<HistoryCalendarInput>> ListMonthDaysAsync(Guid? playerId, DateOnly start, DateOnly end, CancellationToken ct)
    {
        var challenges = await db.Set<DailyChallenge>().AsNoTracking()
            .Where(c => c.Date >= start && c.Date < end)
            .OrderBy(c => c.Date)
            .Select(c => new { c.Id, c.Date, TrackCount = c.Tracks.Count })
            .ToListAsync(ct);
        if (playerId is not { } id)
            return [.. challenges.Select(c => new HistoryCalendarInput(c.Date, c.TrackCount, null, 0, 0))];
        // Une partie au plus par joueur et par défi (index unique).
        var sessions = await (from session in db.Set<DailySession>().AsNoTracking()
                              join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                              where session.PlayerId == id && challenge.Date >= start && challenge.Date < end
                              select new { session.ChallengeId, session.Status, session.TotalScore, AnswerCount = session.Answers.Count })
            .ToDictionaryAsync(s => s.ChallengeId, ct);
        return challenges.Select(c => sessions.TryGetValue(c.Id, out var s)
            ? new HistoryCalendarInput(c.Date, c.TrackCount, s.Status, s.TotalScore, s.AnswerCount)
            : new HistoryCalendarInput(c.Date, c.TrackCount, null, 0, 0)).ToList();
    }

    // Une ligne de projection à propriétés : EF sait la filtrer et la trier ensuite (pas un record à constructeur).
    private sealed class MissedRow
    {
        public DateOnly Date { get; init; }

        public short Position { get; init; }

        public int TrackId { get; init; }

        public bool ArtistCorrect { get; init; }

        public bool TitleCorrect { get; init; }
    }

    // Ses réponses ratées, dans les parties qu'il ne peut plus jouer, sur les défis publiés jusqu'à lastDay ; avec le morceau de la position.
    private IQueryable<MissedRow> Missed(Guid playerId, DateOnly lastDay) =>
        from session in db.Set<DailySession>().AsNoTracking()
        join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
        from answer in session.Answers
        join track in db.Set<ChallengeTrack>().AsNoTracking() on new { session.ChallengeId, answer.Position } equals new { track.ChallengeId, track.Position }
        where session.PlayerId == playerId && session.Status != SessionStatus.Pending && challenge.Date <= lastDay
              && !(answer.ArtistCorrect && answer.TitleCorrect)
        select new MissedRow
        {
            Date = challenge.Date,
            Position = answer.Position,
            TrackId = track.TrackId,
            ArtistCorrect = answer.ArtistCorrect,
            TitleCorrect = answer.TitleCorrect,
        };

    public async Task<IReadOnlyList<MissedAnswer>> ListMissedAnswersAsync(
        Guid playerId, DateOnly lastDay, DateOnly? before, ReplayFilter filter, int takeDays, CancellationToken ct)
    {
        var missed = Missed(playerId, lastDay);
        if (before is { } limit)
            missed = missed.Where(m => m.Date < limit);
        missed = filter switch
        {
            ReplayFilter.None => missed.Where(m => !m.ArtistCorrect && !m.TitleCorrect),
            ReplayFilter.Half => missed.Where(m => m.ArtistCorrect != m.TitleCorrect),
            _ => missed,
        };
        var days = await missed.Select(m => m.Date).Distinct().OrderByDescending(d => d).Take(takeDays).ToListAsync(ct);
        var rows = await missed.Where(m => days.Contains(m.Date)).OrderByDescending(m => m.Date).ThenBy(m => m.Position).ToListAsync(ct);
        return rows.Select(r => new MissedAnswer(r.Date, r.Position, r.TrackId, r.ArtistCorrect, r.TitleCorrect)).ToList();
    }

    public async Task<(int None, int Half)> CountMissedAnswersAsync(Guid playerId, DateOnly lastDay, CancellationToken ct)
    {
        var counts = await Missed(playerId, lastDay)
            .GroupBy(m => !m.ArtistCorrect && !m.TitleCorrect)
            .Select(g => new { Nothing = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        return (counts.Where(c => c.Nothing).Sum(c => c.Count), counts.Where(c => !c.Nothing).Sum(c => c.Count));
    }

    public async Task<BestAnswer?> GetBestAnswerAsync(Guid playerId, DateOnly start, DateOnly end, CancellationToken ct)
    {
        var row = await (from session in db.Set<DailySession>().AsNoTracking()
                         join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                         from answer in session.Answers
                         join track in db.Set<ChallengeTrack>().AsNoTracking() on new { session.ChallengeId, answer.Position } equals new { track.ChallengeId, track.Position }
                         where session.PlayerId == playerId && session.Status == SessionStatus.Completed && challenge.Date >= start && challenge.Date < end
                         orderby answer.Score descending, challenge.Date, answer.Position
                         select new { challenge.Date, answer.Position, track.TrackId, answer.Score })
            .FirstOrDefaultAsync(ct);
        return row is null || row.Score <= 0 ? null : new BestAnswer(row.Date, row.Position, row.TrackId, row.Score);
    }

    public async Task<ReturnRecapRow> GetReturnRecapAsync(Guid playerId, DateOnly yesterday, decimal firstStepSeconds, CancellationToken ct)
    {
        var completed = from session in db.Set<DailySession>().AsNoTracking()
                        join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                        where session.PlayerId == playerId && session.Status == SessionStatus.Completed
                        select new { session.Id, challenge.Date, session.TotalScore };
        var weekStart = yesterday.AddDays(-6);
        var average = await completed.AverageAsync(x => (double?)x.TotalScore, ct);
        var yesterdayScore = await completed.Where(x => x.Date == yesterday).Select(x => (int?)x.TotalScore).FirstOrDefaultAsync(ct);
        var week = completed.Where(x => x.Date >= weekStart && x.Date <= yesterday);
        var weekGames = await week.CountAsync(ct);
        var found = await (from session in db.Set<DailySession>().AsNoTracking()
                           join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                           from answer in session.Answers
                           where session.PlayerId == playerId && session.Status == SessionStatus.Completed
                                 && challenge.Date >= weekStart && challenge.Date <= yesterday
                                 && answer.ArtistCorrect && answer.TitleCorrect && answer.ListenedSeconds <= firstStepSeconds
                           select answer.Position).CountAsync(ct);
        return new ReturnRecapRow(yesterdayScore, average is { } a ? (int)Math.Round(a, MidpointRounding.AwayFromZero) : null, weekGames, found);
    }

    public async Task<DateOnly?> GetFirstChallengeDateAsync(CancellationToken ct) =>
        await db.Set<DailyChallenge>().AsNoTracking().MinAsync(c => (DateOnly?)c.Date, ct);
}

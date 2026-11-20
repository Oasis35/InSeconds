using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>
/// Le profil d'oreille : les parties du joueur, et des agrégats SQL de tous les joueurs (jamais une ligne par réponse, jamais un autre joueur nommé).
/// Les joueurs effacés n'ont plus de parties : aucune lecture de la table des joueurs.
/// </summary>
public sealed class EfDailyProfileQueries(InSecondsDbContext db) : IDailyProfileQueries
{
    public async Task<IReadOnlyList<DatedScore>> ListScoresAsync(Guid playerId, DateOnly since, CancellationToken ct)
    {
        var rows = await (from session in db.Set<DailySession>().AsNoTracking()
                          join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                          where session.PlayerId == playerId && session.Status == SessionStatus.Completed && challenge.Date >= since
                          select new { challenge.Date, session.TotalScore }).ToListAsync(ct);
        return rows.Select(r => new DatedScore(r.Date, r.TotalScore)).ToList();
    }

    public async Task<IReadOnlyList<DayTotal>> ListDayTotalsAsync(DateOnly since, CancellationToken ct)
    {
        var rows = await (from session in db.Set<DailySession>().AsNoTracking()
                          join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                          where session.Status == SessionStatus.Completed && challenge.Date >= since
                          group session by challenge.Date into day
                          select new { Date = day.Key, Games = day.Count(), Sum = day.Sum(s => (long)s.TotalScore) }).ToListAsync(ct);
        return rows.Select(r => new DayTotal(r.Date, r.Games, r.Sum)).ToList();
    }

    public async Task<AnswerTally> GetAnswerTallyAsync(Guid? playerId, DateOnly since, CancellationToken ct)
    {
        var answers = from answer in db.Set<SessionAnswer>().AsNoTracking()
                      join session in db.Set<DailySession>().AsNoTracking() on answer.SessionId equals session.Id
                      join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                      where session.Status != SessionStatus.Pending && challenge.Date >= since && (playerId == null || session.PlayerId == playerId)
                      select answer;

        var totals = await answers
            .GroupBy(_ => 1)
            .Select(g => new { Total = g.Count(), Artist = g.Count(a => a.ArtistCorrect), Title = g.Count(a => a.TitleCorrect) })
            .SingleOrDefaultAsync(ct);
        if (totals is null)
            return AnswerTally.Empty;

        var found = await answers
            .Where(a => a.ArtistCorrect || a.TitleCorrect)
            .GroupBy(a => a.ListenedSeconds)
            .Select(g => new { Seconds = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Seconds, x => x.Count, ct);
        return new AnswerTally(totals.Total, totals.Artist, totals.Title, found);
    }

    public async Task<DateOnly?> GetFirstGameDateAsync(Guid playerId, CancellationToken ct) =>
        await (from session in db.Set<DailySession>().AsNoTracking()
               join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
               where session.PlayerId == playerId && session.Status == SessionStatus.Completed
               select (DateOnly?)challenge.Date).MinAsync(ct);

    public async Task<int> GetBestStreakAsync(Guid playerId, CancellationToken ct) =>
        await db.Set<DailyStreak>().AsNoTracking().Where(s => s.PlayerId == playerId).Select(s => s.BestStreak).FirstOrDefaultAsync(ct);
}

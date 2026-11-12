using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>L'historique d'un joueur : ses parties **terminées**, jamais celles d'un autre (tout part de son identifiant).</summary>
public sealed class EfDailyHistoryQueries(InSecondsDbContext db) : IDailyHistoryQueries
{
    private IQueryable<DailySession> Finished(Guid playerId) =>
        db.Set<DailySession>().AsNoTracking().Where(s => s.PlayerId == playerId && s.Status == SessionStatus.Completed);

    public async Task<DailyHistorySummary> GetSummaryAsync(Guid playerId, CancellationToken ct)
    {
        var totals = await Finished(playerId)
            .GroupBy(_ => 1)
            .Select(g => new { Count = g.Count(), Average = g.Average(s => (double)s.TotalScore), Best = g.Max(s => s.TotalScore) })
            .SingleOrDefaultAsync(ct);
        return totals is null
            ? new DailyHistorySummary(0, null, null)
            : new DailyHistorySummary(totals.Count, (int)Math.Round(totals.Average, MidpointRounding.AwayFromZero), totals.Best);
    }

    public async Task<IReadOnlyList<DateOnly>> ListPlayedDatesAsync(Guid playerId, CancellationToken ct) =>
        await (from session in Finished(playerId)
               join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
               orderby challenge.Date descending
               select challenge.Date).ToListAsync(ct);

    public async Task<IReadOnlyList<DailyHistoryGame>> ListGamesAsync(Guid playerId, DateOnly start, DateOnly end, CancellationToken ct)
    {
        var rows = await (from session in Finished(playerId)
                          join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                          where challenge.Date >= start && challenge.Date < end
                          orderby challenge.Date descending
                          select new
                          {
                              challenge.Date,
                              session.TotalScore,
                              Answers = session.Answers.Select(a => new { a.Position, a.ArtistCorrect, a.TitleCorrect }).ToList(),
                          }).ToListAsync(ct);
        return rows.Select(r => new DailyHistoryGame(
            r.Date, r.TotalScore, r.Answers.Select(a => new DailyHistoryAnswer(a.Position, a.ArtistCorrect, a.TitleCorrect)).ToList())).ToList();
    }
}

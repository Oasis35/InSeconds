using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Runs.Persistence;

/// <summary>L'historique d'un joueur : ses parties **finies** (gagnées ou perdues), jamais celles d'un autre (tout part de son identifiant).</summary>
public sealed class EfRunHistoryQueries(InSecondsDbContext db) : IRunHistoryQueries
{
    private IQueryable<RunSession> Finished(Guid playerId) =>
        db.Set<RunSession>().AsNoTracking()
            .Where(s => s.PlayerId == playerId && (s.Status == RunSessionStatus.Won || s.Status == RunSessionStatus.Lost) && s.EndedAt != null);

    public async Task<RunHistorySummary> GetSummaryAsync(Guid playerId, CancellationToken ct)
    {
        var totals = await Finished(playerId)
            .GroupBy(_ => 1)
            .Select(g => new { Count = g.Count(), Average = g.Average(s => (double)s.TotalScore), Best = g.Max(s => s.TotalScore) })
            .SingleOrDefaultAsync(ct);
        return totals is null
            ? new RunHistorySummary(0, null, null)
            : new RunHistorySummary(totals.Count, (int)Math.Round(totals.Average, MidpointRounding.AwayFromZero), totals.Best);
    }

    public async Task<IReadOnlyList<DateOnly>> ListEndedDaysAsync(Guid playerId, CancellationToken ct)
    {
        var ended = await Finished(playerId).OrderByDescending(s => s.EndedAt).Select(s => s.EndedAt!.Value).ToListAsync(ct);
        return ended.Select(e => DateOnly.FromDateTime(e.UtcDateTime)).ToList();
    }

    public async Task<IReadOnlyList<RunHistoryEntry>> ListAsync(Guid playerId, DateTimeOffset start, DateTimeOffset end, CancellationToken ct)
    {
        var rows = await (from session in Finished(playerId)
                          join challenge in db.Set<RunChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                          where session.EndedAt >= start && session.EndedAt < end
                          orderby session.EndedAt descending, session.Id descending
                          select new
                          {
                              session.Id,
                              challenge.Code,
                              session.Status,
                              session.RoundsPassed,
                              session.TotalScore,
                              EndedAt = session.EndedAt!.Value,
                              Difficulties = session.Rounds.Select(r => r.Difficulty).ToList(),
                          }).ToListAsync(ct);
        return rows.Select(r => new RunHistoryEntry(
            r.Id, r.Code, r.Status, r.RoundsPassed, r.TotalScore, DateOnly.FromDateTime(r.EndedAt.UtcDateTime),
            r.Difficulties.Count == 0 ? RunDifficulty.Safe : r.Difficulties.Max())).ToList();
    }
}

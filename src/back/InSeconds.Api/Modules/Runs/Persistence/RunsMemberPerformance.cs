using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Runs.Domain;
using InSeconds.Api.Modules.Social.Contracts;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Runs.Persistence;

/// <summary>
/// Ce que Runs donne au classement d'un groupe : la performance récente de chaque joueur (<see cref="RunPerformance"/>), son nombre de parties finies
/// et son record. Un joueur sans partie finie (gagnée ou perdue : une partie abandonnée ne compte pas) n'y figure pas. Runs ne connaît de Social que ce
/// contrat.
/// </summary>
public sealed class RunsMemberPerformance(InSecondsDbContext db) : IMemberPerformanceSource
{
    public string Source => "runs";

    public async Task<IReadOnlyDictionary<Guid, MemberPerformance>> GetAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(playerIds);
        var result = new Dictionary<Guid, MemberPerformance>();
        var ids = playerIds.Distinct().ToList();
        if (ids.Count == 0)
            return result;

        var finished = db.Set<RunSession>().AsNoTracking()
            .Where(s => ids.Contains(s.PlayerId) && (s.Status == RunSessionStatus.Won || s.Status == RunSessionStatus.Lost));
        var totals = await finished.GroupBy(s => s.PlayerId)
            .Select(g => new { PlayerId = g.Key, Games = g.Count(), Best = g.Max(s => s.TotalScore) })
            .ToListAsync(ct);
        // Les dernières parties de chacun (au plus RecentGames ; 15 joueurs au plus par groupe : une petite requête par joueur).
        foreach (var total in totals)
        {
            var recent = await (from s in finished
                                join c in db.Set<RunChallenge>().AsNoTracking() on s.ChallengeId equals c.Id
                                where s.PlayerId == total.PlayerId
                                orderby s.EndedAt descending, s.Id descending
                                select new { s.RoundsPassed, c.Rules })
                .Take(RunPerformance.RecentGames)
                .ToListAsync(ct);
            var average = RunPerformance.Average([.. recent.Select(r => RunPerformance.OfGame(r.RoundsPassed, r.Rules.Rounds))]);
            result[total.PlayerId] = new MemberPerformance(average, total.Games, total.Best);
        }

        return result;
    }
}

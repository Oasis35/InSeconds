using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using InSeconds.Api.Modules.Social.Contracts;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Runs.Persistence;

/// <summary>
/// Ce que Runs donne au classement d'un groupe : le **niveau** de chaque joueur (<see cref="RunLevel"/>). Sa performance est la part de ses points de
/// niveau dans ceux du plus haut disque (de 0 à 1), ses points et son disque sont montrés à côté de lui, avec son nombre de parties comptées et son
/// record. Un joueur sans niveau (aucune partie gagnée ou perdue : une partie abandonnée ne compte pas) n'y figure pas. Runs ne connaît de Social que
/// ce contrat.
/// </summary>
public sealed class RunsMemberPerformance(InSecondsDbContext db, RunsRules rules) : IMemberPerformanceSource
{
    public string Source => "runs";

    public async Task<IReadOnlyDictionary<Guid, MemberPerformance>> GetAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(playerIds);
        var result = new Dictionary<Guid, MemberPerformance>();
        var ids = playerIds.Distinct().ToList();
        if (ids.Count == 0)
            return result;

        var levels = await db.Set<RunLevel>().AsNoTracking()
            .Where(l => ids.Contains(l.PlayerId) && l.RunsPlayed > 0)
            .Select(l => new { l.PlayerId, l.Points, l.RunsPlayed })
            .ToListAsync(ct);
        var bests = await db.Set<RunRecord>().AsNoTracking()
            .Where(r => ids.Contains(r.PlayerId))
            .ToDictionaryAsync(r => r.PlayerId, r => r.BestScore, ct);
        var ladder = rules.Levels.Ladder;
        foreach (var level in levels)
        {
            var standing = RunLevelPolicy.Standing(level.Points, ladder);
            result[level.PlayerId] = new MemberPerformance(
                RunLevelPolicy.Share(level.Points, ladder), level.RunsPlayed, bests.TryGetValue(level.PlayerId, out var best) ? best : null,
                level.Points, standing.Current.Disc);
        }

        return result;
    }
}

using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Runs.Persistence;

/// <summary>
/// L'usage des morceaux par Runs : un morceau qui figure dans un défi (<c>runs.challenge_tracks</c>) est « utilisé » (ni suppression ni actualisation :
/// la clé étrangère le refuserait, et le défi doit rester rejouable). Runs n'a ni cooldown ni jour : tout le reste est « aucun »
/// (<see cref="TrackUsage.UsedByMode"/>), les dates et le cooldown restent ceux du Daily. Ajouté au conteneur avec celui des autres modes.
/// </summary>
public sealed class RunsTrackUsage(InSecondsDbContext db) : ITrackUsage
{
    public const string ModeName = "runs";

    public string Mode => ModeName;

    public async Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        if (trackIds.Count == 0)
            return new Dictionary<int, TrackUsage>();
        var used = await db.Set<RunChallengeTrack>().AsNoTracking()
            .Where(t => trackIds.Contains(t.TrackId))
            .Select(t => t.TrackId).Distinct()
            .ToListAsync(ct);
        return used.ToDictionary(id => id, _ => TrackUsage.None with { UsedByMode = true });
    }
}

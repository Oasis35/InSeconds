using InSeconds.Api.Modules.Catalogue.Contracts;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>L'usage des morceaux tous modes confondus : réunit l'<see cref="ITrackUsage"/> de chaque mode enregistré.</summary>
public sealed class TrackPoolUsage(IEnumerable<ITrackUsage> modes) : ITrackPoolUsage
{
    public async Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        var merged = new Dictionary<int, TrackUsage>();
        foreach (var (id, perMode) in await GetByModeAsync(trackIds, ct))
            merged[id] = perMode.Skip(1).Aggregate(perMode[0].Usage, (all, next) => all.CombinedWith(next.Usage));

        return merged;
    }

    public async Task<IReadOnlyDictionary<int, IReadOnlyList<ModeUsage>>> GetByModeAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        var byTrack = new Dictionary<int, List<ModeUsage>>();
        foreach (var mode in modes)
        {
            foreach (var (id, usage) in await mode.GetAsync(trackIds, ct))
            {
                if (!byTrack.TryGetValue(id, out var list))
                    byTrack[id] = list = [];
                list.Add(new ModeUsage(mode.Mode, usage));
            }
        }

        return byTrack.ToDictionary(pair => pair.Key, pair => (IReadOnlyList<ModeUsage>)pair.Value);
    }
}

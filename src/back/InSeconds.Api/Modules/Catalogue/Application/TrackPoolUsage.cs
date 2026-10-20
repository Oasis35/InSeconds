using InSeconds.Api.Modules.Catalogue.Contracts;

namespace InSeconds.Api.Modules.Catalogue.Application;

/// <summary>L'usage des morceaux tous modes confondus : réunit l'<see cref="ITrackUsage"/> de chaque mode enregistré.</summary>
public sealed class TrackPoolUsage(IEnumerable<ITrackUsage> modes) : ITrackPoolUsage
{
    public async Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct)
    {
        var merged = new Dictionary<int, TrackUsage>();
        foreach (var mode in modes)
        {
            foreach (var (id, usage) in await mode.GetAsync(trackIds, ct))
                merged[id] = merged.TryGetValue(id, out var known) ? known.CombinedWith(usage) : usage;
        }

        return merged;
    }
}

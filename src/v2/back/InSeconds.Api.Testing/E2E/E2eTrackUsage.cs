using System.Collections.Concurrent;
using InSeconds.Api.Modules.Catalogue.Contracts;

namespace InSeconds.Api.Testing.E2E;

/// <summary>
/// Usage simulé des morceaux, en mémoire, rempli par le seed (<see cref="CatalogueSeed"/>) et vidé par
/// <c>/api/e2e/reset</c>. À retirer quand Daily (E) fournira le vrai <see cref="ITrackUsage"/>.
/// </summary>
public sealed class E2eTrackUsage : ITrackUsage
{
    private readonly ConcurrentDictionary<int, TrackUsage> _usages = new();

    public void Record(int trackId, DateOnly lastUsed, int count, int cooldownDays, bool inTodayChallenge) =>
        _usages[trackId] = new TrackUsage(lastUsed, count, lastUsed.AddDays(cooldownDays), inTodayChallenge);

    public void Clear() => _usages.Clear();

    public Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(IReadOnlyCollection<int> trackIds, CancellationToken ct) =>
        Task.FromResult<IReadOnlyDictionary<int, TrackUsage>>(
            trackIds.Where(_usages.ContainsKey).Distinct().ToDictionary(id => id, id => _usages[id]));

    public Task<IReadOnlySet<int>> GetTracksInCooldownAsync(DateOnly day, CancellationToken ct) =>
        Task.FromResult<IReadOnlySet<int>>(
            _usages.Where(u => u.Value.UnlockDate > day).Select(u => u.Key).ToHashSet());
}

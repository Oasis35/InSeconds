using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Primitives;

namespace InSeconds.UnitTests.Support;

public sealed record CachedEntry(object Key, object? Value, TimeSpan? Ttl, long? Size);

/// <summary>
/// Cache mémoire qui garde ce qu'on y écrit (clé, durée, taille) : les tests de cache vérifient ce que le
/// décorateur demande au cache, sans attendre l'expiration réelle.
/// </summary>
public sealed class RecordingMemoryCache : IMemoryCache
{
    private readonly Dictionary<object, CachedEntry> _entries = [];

    public IReadOnlyCollection<CachedEntry> Entries => _entries.Values;

    public bool TryGetValue(object key, out object? value)
    {
        var found = _entries.TryGetValue(key, out var entry);
        value = entry?.Value;
        return found;
    }

    public ICacheEntry CreateEntry(object key) => new RecordedEntry(key, entry => _entries[entry.Key] = entry);

    public void Remove(object key) => _entries.Remove(key);

    public void Dispose()
    {
    }

    private sealed class RecordedEntry(object key, Action<CachedEntry> commit) : ICacheEntry
    {
        public object Key { get; } = key;

        public object? Value { get; set; }

        public DateTimeOffset? AbsoluteExpiration { get; set; }

        public TimeSpan? AbsoluteExpirationRelativeToNow { get; set; }

        public TimeSpan? SlidingExpiration { get; set; }

        public IList<IChangeToken> ExpirationTokens { get; } = [];

        public IList<PostEvictionCallbackRegistration> PostEvictionCallbacks { get; } = [];

        public CacheItemPriority Priority { get; set; }

        public long? Size { get; set; }

        public void Dispose() => commit(new CachedEntry(Key, Value, AbsoluteExpirationRelativeToNow, Size));
    }
}

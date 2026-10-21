using InSeconds.Deezer;
using InSeconds.UnitTests.Support;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.UnitTests.Deezer;

/// <summary>
/// Le cache des recherches publiques : une taille posée sur chaque entrée (piège 24), jamais le cache d'une recherche
/// vide ni d'un Deezer indisponible. Les extraits n'ont pas de cache (piège 14 : adresses signées pour 15 min).
/// </summary>
public class DeezerCacheTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly RecordingMemoryCache _recording = new();

    // ---------- Extraits ----------

    [Fact]
    public void Piege14_Extrait_SansCache_LePortEstLeClientBrut()
    {
        // Deezer signe ses adresses d'extrait pour 15 min : un cache servirait des adresses presque expirées. Chaque
        // demande d'extrait doit repartir chez Deezer.
        var services = new ServiceCollection().AddLogging();
        services.AddDeezer(new ConfigurationBuilder().Build());
        using var provider = services.BuildServiceProvider();

        Assert.IsType<DeezerClient>(provider.GetRequiredService<IPreviewProvider>());
    }

    // ---------- Recherches ----------

    [Fact]
    public async Task Recherche_MiseEnCachePour1h_UneSeuleRequete_CleNormalisee()
    {
        var inner = new ScriptedSearch([Track(1)]);
        var search = new CachedTrackSearch(inner, _recording);

        var first = await search.SearchAsync("Daft Punk", 20, Ct);
        var second = await search.SearchAsync("  daft punk ", 20, Ct);

        Assert.Same(first, second);
        Assert.Equal(1, inner.Calls);
        var entry = Assert.Single(_recording.Entries);
        Assert.Equal(TimeSpan.FromHours(1), entry.Ttl);
        Assert.Equal(1, entry.Size);
        Assert.Equal(CacheItemPriority.Normal, entry.Priority);
    }

    [Fact]
    public async Task Recherche_LaLimiteFaitPartieDeLaCle()
    {
        var inner = new ScriptedSearch([Track(1)]);
        var search = new CachedTrackSearch(inner, _recording);

        await search.SearchAsync("daft punk", 10, Ct);
        await search.SearchAsync("daft punk", 20, Ct);

        Assert.Equal(2, inner.Calls);
    }

    [Fact]
    public async Task Recherche_ResultatVide_JamaisMisEnCache()
    {
        var inner = new ScriptedSearch([]);
        var search = new CachedTrackSearch(inner, _recording);

        await search.SearchAsync("zzz", 20, Ct);
        await search.SearchAsync("zzz", 20, Ct);

        Assert.Empty(_recording.Entries);
        Assert.Equal(2, inner.Calls);
    }

    [Fact]
    public async Task Recherche_DeezerIndisponible_JamaisMisEnCache()
    {
        var inner = new ScriptedSearch(new SearchLookup.Unavailable());
        var search = new CachedTrackSearch(inner, _recording);

        Assert.IsType<SearchLookup.Unavailable>(await search.SearchAsync("daft punk", 20, Ct));
        await search.SearchAsync("daft punk", 20, Ct);

        Assert.Empty(_recording.Entries);
        Assert.Equal(2, inner.Calls);
    }

    // ---------- Taille : une SizeLimit exige un Size sur chaque entrée (piège 24) ----------

    [Fact]
    public async Task CacheBorne_LeDecorateurPoseUneTaille_SansExceptionALExecution()
    {
        using var cache = new DeezerCache();
        var search = new CachedTrackSearch(new ScriptedSearch([Track(1)]), cache.Memory);

        // Sans Size, MemoryCache.Set lèverait « Cache entry must specify a value for Size ».
        await search.SearchAsync("daft punk", 20, Ct);

        Assert.True(cache.Memory.TryGetValue("deezer:search:20:daft punk", out _));
    }

    [Fact]
    public async Task CacheDedie_BorneEnNombreDEntrees_EtSeVide()
    {
        using var cache = new DeezerCache();
        var search = new CachedTrackSearch(new ScriptedSearch([Track(1)]), cache.Memory);
        await search.SearchAsync("daft punk", 20, Ct);

        cache.Clear();

        Assert.False(cache.Memory.TryGetValue("deezer:search:20:daft punk", out _));
    }

    private static DeezerTrack Track(long id) => new(id, "Daft Punk", "One More Time", "https://p.mp3", null, 2000, 1, null);

    private sealed class ScriptedSearch(SearchLookup lookup) : ITrackSearch
    {
        public ScriptedSearch(IReadOnlyList<DeezerTrack> results)
            : this(new SearchLookup.Found(results))
        {
        }

        public int Calls { get; private set; }

        public Task<SearchLookup> SearchAsync(string query, int limit, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(lookup);
        }
    }
}

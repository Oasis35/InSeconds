using InSeconds.Deezer;
using InSeconds.UnitTests.Support;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.UnitTests.Deezer;

/// <summary>
/// Les décorateurs de cache : TTL des extraits borné par la signature de l'URL (piège 14), une taille posée sur
/// chaque entrée (piège 24), jamais le cache d'une preview absente ni d'une recherche vide.
/// </summary>
public class DeezerCacheTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly FakeTimeProvider _time = new(Now);
    private readonly RecordingMemoryCache _recording = new();

    // ---------- Extraits ----------

    [Fact]
    public async Task Extrait_SansSignature_MisEnCachePour24h_UneSeuleRequete()
    {
        var inner = new ScriptedPreviews(new PreviewLookup.Found("https://fake-preview.mp3"));
        var provider = new CachedPreviewProvider(inner, _recording, _time);

        var first = await provider.GetPreviewAsync(123, Ct);
        var second = await provider.GetPreviewAsync(123, Ct);

        Assert.Equal(first, second);
        Assert.Equal(1, inner.Calls);
        var entry = Assert.Single(_recording.Entries);
        Assert.Equal(TimeSpan.FromHours(24), entry.Ttl);
        Assert.Equal(1, entry.Size);
    }

    [Fact]
    public async Task Extrait_SignatureValableLongtemps_TtlBorneParLaSignatureMoinsLaMarge()
    {
        // Expire dans 20 h : cache jusqu'à 19 h (1 h de marge pour la lecture réelle côté joueur).
        var provider = new CachedPreviewProvider(new ScriptedPreviews(new PreviewLookup.Found(Signed(Now.AddHours(20)))), _recording, _time);

        await provider.GetPreviewAsync(123, Ct);

        Assert.Equal(TimeSpan.FromHours(19), Assert.Single(_recording.Entries).Ttl);
    }

    [Fact]
    public async Task Extrait_SignatureAuDela24h_TtlPlafonneA24h()
    {
        var provider = new CachedPreviewProvider(new ScriptedPreviews(new PreviewLookup.Found(Signed(Now.AddDays(5)))), _recording, _time);

        await provider.GetPreviewAsync(123, Ct);

        Assert.Equal(TimeSpan.FromHours(24), Assert.Single(_recording.Entries).Ttl);
    }

    [Theory]
    [InlineData(30)] // moins que la marge d'1 h
    [InlineData(60)] // juste la marge : durée nulle
    [InlineData(-60)] // déjà expirée
    public async Task Extrait_SignatureProcheDeLExpirationOuExpiree_JamaisMisEnCache(int minutesLeft)
    {
        var inner = new ScriptedPreviews(new PreviewLookup.Found(Signed(Now.AddMinutes(minutesLeft))));
        var provider = new CachedPreviewProvider(inner, _recording, _time);

        var first = await provider.GetPreviewAsync(123, Ct);
        await provider.GetPreviewAsync(123, Ct);

        Assert.IsType<PreviewLookup.Found>(first);
        Assert.Empty(_recording.Entries);
        Assert.Equal(2, inner.Calls);
    }

    [Fact]
    public async Task Extrait_LeTempsEstCeluiDuTimeProvider()
    {
        var provider = new CachedPreviewProvider(new ScriptedPreviews(new PreviewLookup.Found(Signed(Now.AddHours(10)))), _recording, _time);
        _time.Advance(TimeSpan.FromHours(9.5));

        await provider.GetPreviewAsync(123, Ct);

        // Il ne reste que 30 min avant l'expiration : sous la marge, pas de cache.
        Assert.Empty(_recording.Entries);
    }

    [Theory]
    [MemberData(nameof(NotCacheable))]
    public async Task Extrait_AbsentOuIndisponible_JamaisMisEnCache(PreviewLookup lookup)
    {
        var inner = new ScriptedPreviews(lookup);
        var provider = new CachedPreviewProvider(inner, _recording, _time);

        await provider.GetPreviewAsync(123, Ct);
        await provider.GetPreviewAsync(123, Ct);

        Assert.Empty(_recording.Entries);
        Assert.Equal(2, inner.Calls);
    }

    public static TheoryData<PreviewLookup> NotCacheable() => new() { new PreviewLookup.Missing(), new PreviewLookup.Unavailable() };

    [Fact]
    public async Task Extrait_UneEntreeParMorceau()
    {
        var inner = new ScriptedPreviews(new PreviewLookup.Found("https://fake-preview.mp3"));
        var provider = new CachedPreviewProvider(inner, _recording, _time);

        await provider.GetPreviewAsync(1, Ct);
        await provider.GetPreviewAsync(2, Ct);

        Assert.Equal(2, inner.Calls);
        Assert.Equal(2, _recording.Entries.Count);
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

    // ---------- Taille : une SizeLimit exige un Size sur chaque entrée (piège 24) ----------

    [Fact]
    public async Task CacheBorne_LesDecorateursPosentUneTaille_SansExceptionALExecution()
    {
        using var cache = new DeezerCache();
        var provider = new CachedPreviewProvider(new ScriptedPreviews(new PreviewLookup.Found("https://fake-preview.mp3")), cache.Memory, _time);
        var search = new CachedTrackSearch(new ScriptedSearch([Track(1)]), cache.Memory);

        // Sans Size, MemoryCache.Set lèverait « Cache entry must specify a value for Size ».
        await provider.GetPreviewAsync(123, Ct);
        await search.SearchAsync("daft punk", 20, Ct);

        Assert.True(cache.Memory.TryGetValue("deezer:preview:123", out _));
        Assert.True(cache.Memory.TryGetValue("deezer:search:20:daft punk", out _));
    }

    [Fact]
    public async Task CacheDedie_BorneEnNombreDEntrees_EtSeVide()
    {
        using var cache = new DeezerCache();
        var provider = new CachedPreviewProvider(new ScriptedPreviews(new PreviewLookup.Found("https://fake-preview.mp3")), cache.Memory, _time);
        await provider.GetPreviewAsync(123, Ct);

        cache.Clear();

        Assert.False(cache.Memory.TryGetValue("deezer:preview:123", out _));
    }

    private static string Signed(DateTimeOffset expiry) =>
        $"https://cdnt-preview.dzcdn.net/api/1/x.mp3?hdnea=exp={expiry.ToUnixTimeSeconds()}~acl=/x.mp3*~hmac=abc";

    private static DeezerTrack Track(long id) => new(id, "Daft Punk", "One More Time", "https://p.mp3", null, 2000, 1);

    private sealed class ScriptedPreviews(PreviewLookup lookup) : IPreviewProvider
    {
        public int Calls { get; private set; }

        public Task<PreviewLookup> GetPreviewAsync(long deezerTrackId, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(lookup);
        }
    }

    private sealed class ScriptedSearch(IReadOnlyList<DeezerTrack> results) : ITrackSearch
    {
        public int Calls { get; private set; }

        public Task<IReadOnlyList<DeezerTrack>> SearchAsync(string query, int limit, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(results);
        }
    }
}

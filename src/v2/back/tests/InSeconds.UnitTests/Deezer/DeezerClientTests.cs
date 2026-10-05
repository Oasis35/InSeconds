using System.Net;
using System.Text;
using InSeconds.Deezer;
using InSeconds.UnitTests.Support;

namespace InSeconds.UnitTests.Deezer;

/// <summary>Le client Deezer : les trois ports, et ses erreurs renvoyées en HTTP 200 (piège 16).</summary>
public class DeezerClientTests
{
    private const string Quota = """{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""";
    private const string Busy = """{"error":{"type":"Exception","message":"Service busy","code":700}}""";
    private const string NoData = """{"error":{"type":"DataException","message":"no data","code":800}}""";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---------- Extrait (IPreviewProvider) ----------

    [Fact]
    public async Task Preview_Trouvee()
    {
        var lookup = await Create(Ok("""{"preview":"https://fake-preview.mp3"}""")).GetPreviewAsync(123, Ct);

        Assert.Equal(new PreviewLookup.Found("https://fake-preview.mp3"), lookup);
    }

    [Theory]
    [InlineData("""{"id":123,"title":"T","preview":"","artist":{"name":"A"}}""")]
    [InlineData("""{"id":123,"title":"T","artist":{"name":"A"}}""")]
    public async Task Preview_VideChezDeezer_Absente(string body) =>
        Assert.IsType<PreviewLookup.Missing>(await Create(Ok(body)).GetPreviewAsync(123, Ct));

    [Fact]
    public async Task Preview_ErreurNoData800_MorceauSupprime_Absente() =>
        Assert.IsType<PreviewLookup.Missing>(await Create(Ok(NoData)).GetPreviewAsync(123, Ct));

    [Theory]
    [InlineData(Quota)]
    [InlineData(Busy)]
    [InlineData("""{"error":{"type":"Exception","message":"?","code":9999}}""")]
    public async Task Preview_ErreurDeezerEnHttp200_Indisponible_PasAbsente(string body) =>
        Assert.IsType<PreviewLookup.Unavailable>(await Create(Ok(body)).GetPreviewAsync(123, Ct));

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    public async Task Preview_ErreurHttp_Indisponible(HttpStatusCode status) =>
        Assert.IsType<PreviewLookup.Unavailable>(await Create(new StubHttpHandler((_, _) => Task.FromResult(new HttpResponseMessage(status)))).GetPreviewAsync(123, Ct));

    [Fact]
    public async Task Preview_CorpsQuiNEstPasDuJson_Indisponible() =>
        Assert.IsType<PreviewLookup.Unavailable>(await Create(Ok("<html>oups</html>")).GetPreviewAsync(123, Ct));

    // ---------- Morceau (ITrackMetadataSource) ----------

    [Fact]
    public async Task Morceau_Trouve_AvecAnneeRangPochetteEtExtrait()
    {
        var lookup = await Create(Ok("""
            {"id":123,"title":"One More Time","preview":"https://p.mp3","rank":884273,"release_date":"2000-11-30",
             "artist":{"name":"Daft Punk"},
             "album":{"cover_medium":"https://cdn-images.dzcdn.net/images/cover/abc123def/250x250-000000-80-0-0.jpg"}}
            """)).GetTrackAsync(123, Ct);

        var found = Assert.IsType<TrackMetadataLookup.Found>(lookup);
        Assert.Equal(new DeezerTrack(123, "Daft Punk", "One More Time", "https://p.mp3", "abc123def", 2000, 884273), found.Track);
    }

    [Theory]
    [InlineData("""{"id":1,"title":"T","artist":{"name":"A"}}""", null)]
    [InlineData("""{"id":1,"title":"T","artist":{"name":"A"},"release_date":"n/a"}""", null)]
    [InlineData("""{"id":1,"title":"T","artist":{"name":"A"},"release_date":"2016-05-20"}""", 2016)]
    public async Task Morceau_AnneeDeSortie_VideSiAbsenteOuInattendue(string body, int? year)
    {
        var found = Assert.IsType<TrackMetadataLookup.Found>(await Create(Ok(body)).GetTrackAsync(1, Ct));

        Assert.Equal(year, found.Track.ReleaseYear);
        Assert.Null(found.Track.Rank);
        Assert.Null(found.Track.CoverHash);
    }

    [Fact]
    public async Task Morceau_ErreurNoData800_Introuvable() =>
        Assert.IsType<TrackMetadataLookup.NotFound>(await Create(Ok(NoData)).GetTrackAsync(123, Ct));

    [Fact]
    public async Task Morceau_SansTitreNiArtiste_Introuvable() =>
        Assert.IsType<TrackMetadataLookup.NotFound>(await Create(Ok("""{"id":123,"preview":"p"}""")).GetTrackAsync(123, Ct));

    [Theory]
    [InlineData(Quota)]
    [InlineData(Busy)]
    public async Task Morceau_QuotaOuService_Indisponible_PasIntrouvable(string body) =>
        Assert.IsType<TrackMetadataLookup.Unavailable>(await Create(Ok(body)).GetTrackAsync(123, Ct));

    [Fact]
    public async Task Morceau_ErreurHttp_Indisponible() =>
        Assert.IsType<TrackMetadataLookup.Unavailable>(await Create(new StubHttpHandler((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)))).GetTrackAsync(123, Ct));

    // ---------- Recherche (ITrackSearch) ----------

    [Fact]
    public async Task Recherche_EnvoieLaRequeteEchappeeEtLaLimite()
    {
        var handler = Ok("""{"data":[]}""");

        await Create(handler).SearchAsync("daft punk & co", 20, Ct);

        Assert.Equal("/search?q=daft%20punk%20%26%20co&limit=20", handler.LastRequest!.RequestUri!.PathAndQuery);
    }

    [Fact]
    public async Task Recherche_LitAnneeRangEtIgnoreLesMorceauxSansTitreNiArtiste()
    {
        var results = await Create(Ok("""
            {"data":[
              {"id":1,"title":"T","preview":"p","rank":10,"artist":{"name":"A"},"release_date":"2001-01-01"},
              {"id":2,"preview":"p","artist":{"name":"B"}},
              {"id":3,"title":"U","preview":"p"}
            ]}
            """)).SearchAsync("a", 10, Ct);

        var track = Assert.Single(results);
        Assert.Equal(new DeezerTrack(1, "A", "T", "p", null, 2001, 10), track);
    }

    [Theory]
    [InlineData(Quota)]
    [InlineData(Busy)]
    public async Task Recherche_ErreurDeezerEnHttp200_ListeVide(string body) =>
        Assert.Empty(await Create(Ok(body)).SearchAsync("daft punk", 10, Ct));

    [Fact]
    public async Task Recherche_ErreurHttp_ListeVide() =>
        Assert.Empty(await Create(new StubHttpHandler((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError)))).SearchAsync("daft punk", 10, Ct));

    // ---------- Annulation : relancée, jamais avalée (piège 13) ----------

    [Fact]
    public async Task Annulation_EstPropagee_SurLesTroisPorts()
    {
        var client = Create(new StubHttpHandler((_, ct) =>
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"data":[]}""") });
        }));
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => client.GetPreviewAsync(123, cts.Token));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => client.GetTrackAsync(123, cts.Token));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => client.SearchAsync("daft punk", 10, cts.Token));
    }

    [Fact]
    public async Task DelaiInterneDuHttpClient_PasUneAnnulation_EchecDeDeezer()
    {
        // Un timeout de HttpClient lève une TaskCanceledException alors que l'appelant n'a rien annulé : indisponible.
        var client = Create(new StubHttpHandler((_, _) => throw new TaskCanceledException("délai dépassé")));

        Assert.IsType<PreviewLookup.Unavailable>(await client.GetPreviewAsync(123, Ct));
        Assert.IsType<TrackMetadataLookup.Unavailable>(await client.GetTrackAsync(123, Ct));
        Assert.Empty(await client.SearchAsync("daft punk", 10, Ct));
    }

    [Theory]
    [InlineData("""{"id":1,"title":"   ","artist":{"name":"A"}}""")]
    [InlineData("""{"id":1,"title":"T","artist":{"name":""}}""")]
    [InlineData("""{"id":1,"title":"","artist":{"name":"  "}}""")]
    public async Task Morceau_ArtisteOuTitreBlanc_Introuvable(string body)
    {
        Assert.IsType<TrackMetadataLookup.NotFound>(await Create(Ok(body)).GetTrackAsync(1, Ct));
        Assert.Empty(await Create(Ok("{\"data\":[" + body + "]}")).SearchAsync("a", 10, Ct));
    }

    [Theory]
    [InlineData("0000-00-00")]
    [InlineData("0000")]
    public async Task Morceau_AnneeZero_Inconnue(string releaseDate)
    {
        var body = "{\"id\":1,\"title\":\"T\",\"artist\":{\"name\":\"A\"},\"release_date\":\"" + releaseDate + "\"}";

        var found = Assert.IsType<TrackMetadataLookup.Found>(await Create(Ok(body)).GetTrackAsync(1, Ct));

        Assert.Null(found.Track.ReleaseYear);
    }

    // ---------- Journal : jamais le texte d'une recherche (piège 36) ----------

    [Theory]
    [InlineData(Quota)]
    [InlineData("<html>oups</html>")]
    public async Task Recherche_Journal_SeulementLaLongueurDeLaRequete_JamaisSonContenu(string body)
    {
        const string query = "un nom tres identifiant clement rageau";
        var logger = new CapturingLogger<DeezerClient>();

        await new DeezerClient(new HttpClient(Ok(body)) { BaseAddress = new Uri("https://api.deezer.com") }, logger).SearchAsync(query, 10, Ct);

        var entry = Assert.Single(logger.Entries);
        Assert.DoesNotContain(query, entry.Message, StringComparison.Ordinal);
        Assert.Contains(entry.Properties, p => p.Key == "QueryLength" && Equals(p.Value, query.Length));
        Assert.DoesNotContain(entry.Properties, p => p.Value?.ToString()?.Contains(query, StringComparison.Ordinal) == true);
    }

    [Fact]
    public async Task Recherche_ErreurHttp_Journalisee_SansLaRequete()
    {
        const string query = "un nom tres identifiant clement rageau";
        var logger = new CapturingLogger<DeezerClient>();
        var handler = new StubHttpHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError)));

        await new DeezerClient(new HttpClient(handler) { BaseAddress = new Uri("https://api.deezer.com") }, logger).SearchAsync(query, 10, Ct);

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(Microsoft.Extensions.Logging.LogLevel.Warning, entry.Level);
        Assert.DoesNotContain(query, entry.Message, StringComparison.Ordinal);
        Assert.NotNull(entry.Exception);
    }

    [Fact]
    public async Task Extrait_ErreurDeezer_Journalisee_EnWarning_AvecLeCode()
    {
        var logger = new CapturingLogger<DeezerClient>();

        await new DeezerClient(new HttpClient(Ok(Quota)) { BaseAddress = new Uri("https://api.deezer.com") }, logger).GetPreviewAsync(123, Ct);

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(Microsoft.Extensions.Logging.LogLevel.Warning, entry.Level);
        Assert.Contains(entry.Properties, p => p.Key == "DeezerCode" && Equals(p.Value, 4));
    }

    private static DeezerClient Create(StubHttpHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("https://api.deezer.com") }, new CapturingLogger<DeezerClient>());

    private static StubHttpHandler Ok(string body) =>
        new((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        }));
}

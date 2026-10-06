using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using static InSeconds.IntegrationTests.Catalogue.CatalogueApi;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>
/// Recherche publique <c>GET /api/catalogue/search</c> (autocomplétion du jeu) : le vrai client Deezer et son cache,
/// sur le faux Deezer de l'hôte de test.
/// </summary>
public class SearchTests(PostgresFixture postgres) : IAsyncLifetime
{
    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Theory]
    [InlineData("a")]
    [InlineData("")]
    [InlineData("   ")]
    public async Task RequeteTropCourteOuVide_ListeVide_SansAppelerDeezer(string q)
    {
        var results = await SearchAsync(_app.Api.CreateClient(), q);

        Assert.Empty(results);
        Assert.Empty(_app.Deezer.Requests);
    }

    [Fact]
    public async Task RequeteTropLongue_ListeVide_SansAppelerDeezer()
    {
        var results = await SearchAsync(_app.Api.CreateClient(), new string('a', 101));

        Assert.Empty(results);
        Assert.Empty(_app.Deezer.Requests);
    }

    [Fact]
    public async Task SansParametre_ListeVide()
    {
        var response = await _app.Api.CreateClient().GetAsync("/api/catalogue/search", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await response.Content.ReadFromJsonAsync<List<TrackSuggestion>>(Ct))!);
    }

    [Fact]
    public async Task RequeteNormale_UneSuggestion_SansAuthentification()
    {
        var results = await SearchAsync(_app.Api.CreateClient(), "e2e-search-normal");

        Assert.Equal([new TrackSuggestion("E2E Artist", "E2E Track")], results);
    }

    [Fact]
    public async Task TitresAvecParentheses_SontNettoyesEtDedupliques()
    {
        // Le faux Deezer renvoie, pour ce déclencheur, trois variantes du même morceau + un morceau distinct.
        var results = await SearchAsync(_app.Api.CreateClient(), "dedup-test");

        Assert.Equal(
            [new TrackSuggestion("E2E Artist", "E2E Track"), new TrackSuggestion("Other Artist", "Another Track")],
            results);
    }

    [Fact]
    public async Task SurDemandeVingResultatsADeezer_PlafonneADix()
    {
        _app.Deezer.Intercept = (request, _) => Task.FromResult<HttpResponseMessage?>(
            request.RequestUri!.AbsolutePath == "/search" ? Json(ManyTracks(25)) : null);

        var results = await SearchAsync(_app.Api.CreateClient(), "beaucoup");

        Assert.Equal(10, results.Count);
        Assert.Equal("Titre 1", results[0].Title);
        Assert.Contains(_app.Deezer.Requests, r => r.StartsWith("/search?q=beaucoup&limit=20", StringComparison.Ordinal));
    }

    [Fact]
    public async Task UneMemeRecherche_CacheeUneHeure_UneSeuleRequeteADeezer()
    {
        var client = _app.Api.CreateClient();

        await SearchAsync(client, "Daft Punk");
        await SearchAsync(client, "  daft punk ");

        Assert.Single(_app.Deezer.Requests, r => r.StartsWith("/search", StringComparison.Ordinal));
    }

    [Fact]
    public async Task ErreurDeezerEnHttp200_ListeVide_Jamais_MiseEnCache()
    {
        var error = true;
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(
            error ? Json("""{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""") : null);
        var client = _app.Api.CreateClient();

        Assert.Empty(await SearchAsync(client, "dedup-test"));

        // Deezer répond de nouveau : l'échec précédent n'a pas été gardé.
        error = false;
        Assert.Equal(2, (await SearchAsync(client, "dedup-test")).Count);
    }

    [Fact]
    public async Task Limitee_A60RequetesParTranche_Par_IP_429AuDela()
    {
        await using var limited = CatalogueApi.Create(await postgres.CreateDatabaseAsync(), new Dictionary<string, string> { ["RateLimiting:Enabled"] = "true" });
        var client = limited.Api.CreateClient();

        for (var i = 0; i < 60; i++)
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/catalogue/search?q=requete{i}", Ct)).StatusCode);

        await AssertProblemAsync(await client.GetAsync("/api/catalogue/search?q=une-de-trop", Ct), HttpStatusCode.TooManyRequests, "common.too_many_requests");
    }

    private static async Task<IReadOnlyList<TrackSuggestion>> SearchAsync(HttpClient client, string q)
    {
        var response = await client.GetAsync($"/api/catalogue/search?q={Uri.EscapeDataString(q)}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<List<TrackSuggestion>>(Ct))!;
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };

    private static string ManyTracks(int count) =>
        "{\"data\":[" + string.Join(",", Enumerable.Range(1, count).Select(i =>
            "{\"id\":" + i + ",\"title\":\"Titre " + i + "\",\"preview\":\"p\",\"artist\":{\"name\":\"Artiste " + i + "\"}}")) + "]}";
}

using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Features.Deezer;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class DeezerSearchTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Search_QueryTropCourte_RetourneListeVide()
    {
        var resp = await _client.GetAsync("/api/deezer/search?q=a");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var results = await resp.Content.ReadFromJsonAsync<List<DeezerSearchResult>>();
        Assert.NotNull(results);
        Assert.Empty(results);
    }

    [Fact]
    public async Task Search_RequeteNormale_RetourneResultat()
    {
        var resp = await _client.GetAsync("/api/deezer/search?q=e2e-search-normal");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var results = await resp.Content.ReadFromJsonAsync<List<DeezerSearchResult>>();
        Assert.NotNull(results);
        Assert.Single(results);
        Assert.Equal("E2E Artist", results[0].Artist);
        Assert.Equal("E2E Track", results[0].Title);
    }

    [Fact]
    public async Task Search_TitresAvecParentheses_SontNettoyesEtDedupliques()
    {
        // FakeDeezerHandler renvoie, pour ce déclencheur, 3 variantes du même morceau
        // ("E2E Track (Remastered 2011)", "E2E Track (Live)", "E2E Track") + un morceau distinct.
        var resp = await _client.GetAsync("/api/deezer/search?q=dedup-test");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var results = await resp.Content.ReadFromJsonAsync<List<DeezerSearchResult>>();
        Assert.NotNull(results);

        // Les 3 variantes parenthésées ont fusionné en une seule suggestion nettoyée.
        Assert.Equal(2, results.Count);
        Assert.Equal("E2E Artist", results[0].Artist);
        Assert.Equal("E2E Track", results[0].Title);
        Assert.Equal("Other Artist", results[1].Artist);
        Assert.Equal("Another Track", results[1].Title);
    }

    [Fact]
    public async Task Search_NeNecessitePasDAuth()
    {
        var freshClient = factory.CreateClient();

        var resp = await freshClient.GetAsync("/api/deezer/search?q=e2e-search-no-auth");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }
}

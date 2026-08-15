using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Features.Players.GetCurrentPlayer;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class PlayersTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task GetCurrentPlayer_Retourne200AvecUnPlayerIdNonVide()
    {
        var resp = await _client.GetAsync("/api/players/me");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<GetCurrentPlayerResponse>();
        Assert.NotNull(body);
        Assert.NotEqual(Guid.Empty, body.PlayerId);
    }

    [Fact]
    public async Task GetCurrentPlayer_MemeCookie_RetourneToujoursLeMemeId()
    {
        // HttpClient conserve le cookie authToken entre les appels (CookieContainer) —
        // deux appels consécutifs doivent résoudre le même joueur, pas en créer un nouveau.
        var firstResp = await _client.GetAsync("/api/players/me");
        var firstBody = await firstResp.Content.ReadFromJsonAsync<GetCurrentPlayerResponse>();

        var secondResp = await _client.GetAsync("/api/players/me");
        var secondBody = await secondResp.Content.ReadFromJsonAsync<GetCurrentPlayerResponse>();

        Assert.NotNull(firstBody);
        Assert.NotNull(secondBody);
        Assert.Equal(firstBody.PlayerId, secondBody.PlayerId);
    }

    [Fact]
    public async Task GetCurrentPlayer_SansAuthAdmin_Retourne200()
    {
        // Endpoint public (hors /api/admin) — aucun header Authorization requis, contrairement
        // aux routes Admin/* qui répondent 401 sans Bearer admin-token.
        var resp = await _client.GetAsync("/api/players/me");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }
}

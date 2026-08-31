using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Features.Players.GetCurrentPlayer;
using Microsoft.Extensions.DependencyInjection;

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

    [Fact]
    public async Task GetCurrentPlayer_Guest_IsGuestTrueEtEmailPseudoNull()
    {
        var client = factory.CreateClient();

        var body = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me");

        Assert.NotNull(body);
        Assert.True(body.IsGuest);
        Assert.Null(body.Email);
        Assert.Null(body.Pseudo);
    }

    [Fact]
    public async Task GetCurrentPlayer_CompteLie_IsGuestFalseEtEmailPseudoRenseignes()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");

        await client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = "allowed@e2e.test" });

        var capture = factory.Services.GetRequiredService<InSeconds.Api.Common.Email.TestEmailCapture>();
        Assert.True(capture.TryGetLast("allowed@e2e.test", out var lastEmail));
        var match = System.Text.RegularExpressions.Regex.Match(lastEmail.Html, "token=([^&\"]+)");
        Assert.True(match.Success);

        await client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = match.Groups[1].Value, Pseudo = "CompteLieTest" });

        var body = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me");

        Assert.NotNull(body);
        Assert.False(body.IsGuest);
        Assert.Equal("allowed@e2e.test", body.Email);
        Assert.Equal("CompteLieTest", body.Pseudo);
    }
}

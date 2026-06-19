using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Features.Stats.Today;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class StatsTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task TodayStats_SansSession_RetourneScoreNullEtZeroJoueurs()
    {
        var resp = await _client.GetAsync("/api/stats/today");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<TodayStatsResponse>();
        Assert.NotNull(body);
        Assert.Null(body.YourScore);
        Assert.Equal(0, body.TotalPlayers);
        Assert.Equal(3, body.Tracks.Count); // le défi du jour a 3 morceaux
    }

    [Fact]
    public async Task TodayStats_ApresUnePartie_RetourneScoreEtUnJoueur()
    {
        // Joue une partie complète
        var sessionResp = await _client.PostAsync("/api/sessions", null);
        var session = await sessionResp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);

        foreach (var track in session.Tracks)
        {
            await _client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
                new SubmitAnswerBody(track.Id, 1m, false, "Eminem", "Lose Yourself"));
        }

        var resp = await _client.GetAsync("/api/stats/today");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<TodayStatsResponse>();
        Assert.NotNull(body);
        Assert.NotNull(body.YourScore);
        Assert.Equal(1, body.TotalPlayers);
        Assert.True(body.YourScore >= 0);
    }

    [Fact]
    public async Task TodayStats_RetourneStatsParMorceau()
    {
        var resp = await _client.GetAsync("/api/stats/today");

        var body = await resp.Content.ReadFromJsonAsync<TodayStatsResponse>();
        Assert.NotNull(body);
        Assert.All(body.Tracks, t =>
        {
            Assert.True(t.Position >= 1);
            Assert.NotEmpty(t.Artist);
            Assert.NotEmpty(t.Title);
        });
    }
}

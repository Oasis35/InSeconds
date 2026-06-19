using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class SessionTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── StartSession ────────────────────────────────────────────────────────

    [Fact]
    public async Task StartSession_RetourneSession_AvecTroisTracks()
    {
        var resp = await _client.PostAsync("/api/sessions", null);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var session = await resp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);
        Assert.Equal(3, session.Tracks.Count);
        Assert.All(session.Tracks, t => Assert.NotEmpty(t.PreviewUrl));
    }

    [Fact]
    public async Task StartSession_TracksOrdonnees_ParPosition()
    {
        var resp = await _client.PostAsync("/api/sessions", null);
        var session = await resp.Content.ReadFromJsonAsync<StartSessionResponse>();

        Assert.NotNull(session);
        var positions = session.Tracks.Select(t => t.Position).ToList();
        Assert.Equal(positions.OrderBy(p => p).ToList(), positions);
    }

    [Fact]
    public async Task StartSession_DeuxiemeAppel_Retourne409()
    {
        await _client.PostAsync("/api/sessions", null);
        var resp2 = await _client.PostAsync("/api/sessions", null);

        Assert.Equal(HttpStatusCode.Conflict, resp2.StatusCode);
    }

    // ── SubmitAnswer — scoring ───────────────────────────────────────────────

    [Fact]
    public async Task SubmitAnswer_BonneReponse_RetourneScoreMax()
    {
        var session = await StartSessionAsync();
        var track = session.Tracks[0];

        var resp = await SubmitAsync(session.SessionId, track.Id, 0.5m, "Eminem", "Lose Yourself");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var result = await resp.Content.ReadFromJsonAsync<SubmitAnswerResponse>();
        Assert.NotNull(result);
        Assert.True(result.ArtistCorrect);
        Assert.True(result.TitleCorrect);
        Assert.Equal(1000, result.Score); // palier 0.5s = 1000 pts
    }

    [Fact]
    public async Task SubmitAnswer_MauvaiseReponse_RetourneZero()
    {
        var session = await StartSessionAsync();
        var track = session.Tracks[0];

        var resp = await SubmitAsync(session.SessionId, track.Id, 1m, "zzz", "zzz");

        var result = await resp.Content.ReadFromJsonAsync<SubmitAnswerResponse>();
        Assert.NotNull(result);
        Assert.False(result.ArtistCorrect);
        Assert.False(result.TitleCorrect);
        Assert.Equal(0, result.Score);
    }

    [Fact]
    public async Task SubmitAnswer_ArtisteSeul_RetourneDemiScore()
    {
        var session = await StartSessionAsync();
        var track = session.Tracks[0];

        var resp = await SubmitAsync(session.SessionId, track.Id, 1m, "Eminem", null);

        var result = await resp.Content.ReadFromJsonAsync<SubmitAnswerResponse>();
        Assert.NotNull(result);
        Assert.True(result.ArtistCorrect);
        Assert.False(result.TitleCorrect);
        Assert.Equal(425, result.Score); // 50 % × 850 pts (palier 1s)
    }

    [Fact]
    public async Task SubmitAnswer_PalierCourt_DonnePlusDePoints_QuePalierLong()
    {
        // Round 1 — palier 0.5s
        var session1 = await StartSessionAsync();
        var resp1 = await SubmitAsync(session1.SessionId, session1.Tracks[0].Id, 0.5m, "Eminem", "Lose Yourself");
        var result1 = await resp1.Content.ReadFromJsonAsync<SubmitAnswerResponse>();

        // Reset pour rejouer (nouveau player via cookie différent)
        await factory.ResetAsync();

        // Round 2 — palier 10s
        var session2 = await StartSessionAsync();
        var resp2 = await SubmitAsync(session2.SessionId, session2.Tracks[0].Id, 10m, "Eminem", "Lose Yourself");
        var result2 = await resp2.Content.ReadFromJsonAsync<SubmitAnswerResponse>();

        Assert.NotNull(result1);
        Assert.NotNull(result2);
        Assert.True(result1.Score > result2.Score);
    }

    [Fact]
    public async Task SubmitAnswer_TrackInexistante_Retourne404()
    {
        var session = await StartSessionAsync();

        var resp = await SubmitAsync(session.SessionId, 99999, 1m, "X", null);

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task SubmitAnswer_DeuxiemeSoumissionMemePiste_Retourne409()
    {
        var session = await StartSessionAsync();
        var track = session.Tracks[0];

        await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);
        var resp2 = await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        Assert.Equal(HttpStatusCode.Conflict, resp2.StatusCode);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private async Task<StartSessionResponse> StartSessionAsync()
    {
        var resp = await _client.PostAsync("/api/sessions", null);
        resp.EnsureSuccessStatusCode();
        var session = await resp.Content.ReadFromJsonAsync<StartSessionResponse>();
        return session!;
    }

    private Task<HttpResponseMessage> SubmitAsync(
        int sessionId, int trackId, decimal duration,
        string? artist, string? title)
    {
        var body = new SubmitAnswerBody(
            DailyChallengeTrackId:   trackId,
            ListenedDurationSeconds: duration,
            WasExtended:             false,
            ArtistAnswer:            artist,
            TitleAnswer:             title);

        return _client.PostAsJsonAsync($"/api/sessions/{sessionId}/answers", body);
    }
}

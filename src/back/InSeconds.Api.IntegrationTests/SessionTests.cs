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
        Assert.False(session.IsResuming);
        Assert.Equal(0, session.ResumeFromPosition);
        Assert.Empty(session.CompletedAnswers);
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
    public async Task StartSession_SessionCompleted_Retourne409()
    {
        // Jouer une partie complète
        var session = await StartSessionAsync();
        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        // Re-démarrer → 409
        var resp2 = await _client.PostAsync("/api/sessions", null);
        Assert.Equal(HttpStatusCode.Conflict, resp2.StatusCode);
    }

    [Fact]
    public async Task StartSession_SessionAbandoned_Retourne409()
    {
        var session = await StartSessionAsync();
        await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);

        var resp2 = await _client.PostAsync("/api/sessions", null);
        Assert.Equal(HttpStatusCode.Conflict, resp2.StatusCode);
    }

    [Fact]
    public async Task StartSession_SessionPending_RetourneReprise()
    {
        // Démarrer et répondre au 1er morceau
        var session = await StartSessionAsync();
        await SubmitAsync(session.SessionId, session.Tracks[0].Id, 1m, "X", null);

        // Re-POST → reprise
        var resp2 = await _client.PostAsync("/api/sessions", null);
        Assert.Equal(HttpStatusCode.OK, resp2.StatusCode);

        var resume = await resp2.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(resume);
        Assert.True(resume.IsResuming);
        Assert.Equal(session.SessionId, resume.SessionId);
        Assert.Equal(1, resume.ResumeFromPosition);
        Assert.Single(resume.CompletedAnswers);
    }

    // ── AbandonSession ───────────────────────────────────────────────────────

    [Fact]
    public async Task AbandonSession_SessionPending_MarqueAbandoned()
    {
        var session = await StartSessionAsync();

        var resp = await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        // Re-POST → 409
        var resp2 = await _client.PostAsync("/api/sessions", null);
        Assert.Equal(HttpStatusCode.Conflict, resp2.StatusCode);
    }

    [Fact]
    public async Task AbandonSession_SessionCompletee_RetourneBadRequest()
    {
        var session = await StartSessionAsync();
        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        var resp = await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
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

    [Fact]
    public async Task SubmitAnswer_DerniereReponse_MarqueSessionComplete()
    {
        var session = await StartSessionAsync();
        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        // Re-POST → 409 avec error = "already_played" (Completed)
        var resp2 = await _client.PostAsync("/api/sessions", null);
        Assert.Equal(HttpStatusCode.Conflict, resp2.StatusCode);

        var body = await resp2.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("already_played", body.GetProperty("error").GetString());
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

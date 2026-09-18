using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Sessions.RequestHint;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class RequestHintTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task RequestHint_Level1_NotUnlocked_Retourne409()
    {
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;
        await UpdateListeningAsync(session.SessionId, trackId, 2m); // < 5s, palier niveau 1 non atteint

        var resp = await RequestHintAsync(session.SessionId, trackId, level: 1);

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task RequestHint_Level1_Unlocked_RetourneAnnee()
    {
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;
        await UpdateListeningAsync(session.SessionId, trackId, 5m);

        var resp = await RequestHintAsync(session.SessionId, trackId, level: 1);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<RequestHintResponse>();
        Assert.NotNull(body);
        Assert.Null(body.ArtistMasked); // niveau 1 seul : pas d'artiste masqué
    }

    [Fact]
    public async Task RequestHint_Level2_NotUnlocked_Retourne409()
    {
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;
        await UpdateListeningAsync(session.SessionId, trackId, 5m); // débloque niveau 1 seulement

        var resp = await RequestHintAsync(session.SessionId, trackId, level: 2);

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task RequestHint_Level2_Unlocked_RetourneAnneeEtArtisteMasque()
    {
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;
        await UpdateListeningAsync(session.SessionId, trackId, 10m);

        var resp = await RequestHintAsync(session.SessionId, trackId, level: 2);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<RequestHintResponse>();
        Assert.NotNull(body);
        Assert.NotNull(body.ArtistMasked);
        Assert.Contains('_', body.ArtistMasked);
    }

    [Fact]
    public async Task RequestHint_Level2_SansAvoirDemandeLeNiveau1_RenvoieQuandMemeLesDeux()
    {
        // Cumulatif : demander directement le niveau 2 donne aussi le contenu du niveau 1.
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;
        await UpdateListeningAsync(session.SessionId, trackId, 10m);

        var resp = await RequestHintAsync(session.SessionId, trackId, level: 2);

        var body = await resp.Content.ReadFromJsonAsync<RequestHintResponse>();
        Assert.NotNull(body);
        Assert.NotNull(body.ArtistMasked);
    }

    [Fact]
    public async Task RequestHint_TrackDifferenteDeLaTrackEnCours_Retourne400()
    {
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;
        var otherTrackId = session.Tracks[1].Id;
        await UpdateListeningAsync(session.SessionId, trackId, 10m);

        var resp = await RequestHintAsync(session.SessionId, otherTrackId, level: 1);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task RequestHint_NiveauHorsBornes_Retourne400()
    {
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;
        await UpdateListeningAsync(session.SessionId, trackId, 10m);

        var resp = await RequestHintAsync(session.SessionId, trackId, level: 3);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task RequestHint_PuisSubmitAnswer_PersistLeNiveauEtPenaliseLeScore()
    {
        var session = await StartSessionAsync();
        var track = session.Tracks[0];
        await UpdateListeningAsync(session.SessionId, track.Id, 10m);
        await RequestHintAsync(session.SessionId, track.Id, level: 2);

        var resp = await SubmitAsync(session.SessionId, track.Id, 10m, "Eminem", "Lose Yourself");

        var result = await resp.Content.ReadFromJsonAsync<SubmitAnswerResponse>();
        Assert.NotNull(result);
        Assert.Equal(2, result.HintLevelUsed);
        Assert.Equal(60, result.HintPenaltyPercentApplied);
        Assert.Equal(40, result.Score); // 10s=100 × (1 - 0.60)

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var answer = await db.GameSessionAnswers.SingleAsync(a => a.GameSessionId == session.SessionId);
        Assert.Equal(2, answer.HintLevelUsed);
    }

    [Fact]
    public async Task RequestHint_JamaisDemande_SubmitAnswer_HintLevelUsedZero()
    {
        var session = await StartSessionAsync();
        var track = session.Tracks[0];

        var resp = await SubmitAsync(session.SessionId, track.Id, 0.5m, "Eminem", "Lose Yourself");

        var result = await resp.Content.ReadFromJsonAsync<SubmitAnswerResponse>();
        Assert.NotNull(result);
        Assert.Equal(0, result.HintLevelUsed);
        Assert.Equal(0, result.HintPenaltyPercentApplied);
        Assert.Equal(1000, result.Score); // aucun malus
    }

    [Fact]
    public async Task RequestHint_TrackReleaseYearNull_NeRetournePasDErreur()
    {
        // Le pool seed n'a pas encore de ReleaseYear backfillé (cf. RefreshReleaseYears) —
        // l'indice niveau 1 doit dégrader gracieusement plutôt que planter.
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;
        await UpdateListeningAsync(session.SessionId, trackId, 5m);

        var resp = await RequestHintAsync(session.SessionId, trackId, level: 1);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<RequestHintResponse>();
        Assert.NotNull(body);
        Assert.Null(body.Year);
    }

    [Fact]
    public async Task RequestHint_SansSession_Retourne404()
    {
        var resp = await RequestHintAsync(sessionId: 999, trackId: 1, level: 1);

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private async Task<StartSessionResponse> StartSessionAsync()
    {
        var resp = await _client.PostAsync("/api/sessions", null);
        resp.EnsureSuccessStatusCode();
        var session = await resp.Content.ReadFromJsonAsync<StartSessionResponse>();
        return session!;
    }

    private Task<HttpResponseMessage> UpdateListeningAsync(int sessionId, int trackId, decimal listenedSeconds) =>
        _client.PatchAsJsonAsync($"/api/sessions/{sessionId}/listening", new { trackId, listenedSeconds });

    private Task<HttpResponseMessage> RequestHintAsync(int sessionId, int trackId, int level) =>
        _client.PostAsJsonAsync($"/api/sessions/{sessionId}/hint", new RequestHintBody(trackId, level));

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

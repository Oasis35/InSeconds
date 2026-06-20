using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Features.Admin.Tracks.AddTrack;
using InSeconds.Api.Features.Admin.Tracks.GetTracks;
using InSeconds.Api.Features.Admin.Challenges.GetChallenges;
using InSeconds.Api.Features.Admin.Stats.GetAdminStats;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class AdminTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    // Le FakeDeezerHandler retourne toujours DeezerTrackId=912486 (Eminem) comme track info.
    // Pour AddTrack on utilise des DeezerTrackIds du seed qui existent déjà en base,
    // ou un Id fictif que le fake handler sait gérer.
    private const long ExistingDeezerTrackId = 912486L; // Eminem — dans le seed
    private const long FakeDeezerTrackId     = 99999999L; // Id fictif — FakeDeezerHandler le gère

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── Login ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Login_BonMotDePasse_Retourne200AvecToken()
    {
        var resp = await _client.PostAsJsonAsync("/api/admin/login", new { Password = "e2e-admin-password" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(body);
        Assert.Equal("admin-token", body.Token);
    }

    [Fact]
    public async Task Login_MauvaisMotDePasse_Retourne401()
    {
        var resp = await _client.PostAsJsonAsync("/api/admin/login", new { Password = "wrong" });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    // ── AddTrack ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task AddTrack_SansAuth_Retourne401()
    {
        var resp = await _client.PostAsJsonAsync("/api/admin/tracks", new { DeezerTrackId = FakeDeezerTrackId });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task AddTrack_TrackDejaEnBase_RetourneExistant()
    {
        // ExistingDeezerTrackId est dans le seed — déjà en base
        var resp = await AdminPostAsync("/api/admin/tracks", new { DeezerTrackId = ExistingDeezerTrackId });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<AddTrackResponse>();
        Assert.NotNull(body);
        Assert.Equal(ExistingDeezerTrackId, body.DeezerTrackId);
        Assert.NotEmpty(body.Artist);
    }

    [Fact]
    public async Task AddTrack_NouvelleTrack_Retourne200()
    {
        var resp = await AdminPostAsync("/api/admin/tracks", new { DeezerTrackId = FakeDeezerTrackId });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<AddTrackResponse>();
        Assert.NotNull(body);
        Assert.Equal(FakeDeezerTrackId, body.DeezerTrackId);
    }

    // ── GetTracks ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetTracks_SansAuth_Retourne401()
    {
        var resp = await _client.GetAsync("/api/admin/tracks");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task GetTracks_RetourneTracks_SepareenDisponiblesEtUtilises()
    {
        var resp = await AdminGetAsync("/api/admin/tracks");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<GetTracksResponse>();
        Assert.NotNull(body);
        // Le seed a 9 tracks : 6 dans des défis passés (J-2, J-1) = Used, 3 dans le défi du jour = Used aussi
        // Toutes les tracks sont utilisées dans un défi, aucune disponible
        Assert.Empty(body.Available);
        Assert.Equal(9, body.Used.Count);
    }

    // ── GetChallenges ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetChallenges_SansAuth_Retourne401()
    {
        var resp = await _client.GetAsync("/api/admin/challenges");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task GetChallenges_RetourneTroisDefis()
    {
        var resp = await AdminGetAsync("/api/admin/challenges");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<List<ChallengeDto>>();
        Assert.NotNull(body);
        Assert.Equal(3, body.Count); // seed crée exactement J-2, J-1, aujourd'hui
        Assert.All(body, c => Assert.Equal(3, c.Tracks.Count));
    }

    // ── CreateChallenge ───────────────────────────────────────────────────────

    [Fact]
    public async Task CreateChallenge_DateDejaExistante_Retourne409()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");

        var resp = await AdminPostAsync("/api/admin/challenges", new
        {
            Date = today,
            DeezerTrackIds = new[] { ExistingDeezerTrackId }
        });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task CreateChallenge_NouvelleDate_Retourne200()
    {
        var futureDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(30).ToString("yyyy-MM-dd");

        var resp = await AdminPostAsync("/api/admin/challenges", new
        {
            Date = futureDate,
            DeezerTrackIds = new[] { ExistingDeezerTrackId }
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<ChallengeDto>();
        Assert.NotNull(body);
        Assert.Single(body.Tracks);
    }

    // ── ResetToday ────────────────────────────────────────────────────────────

    [Fact]
    public async Task ResetToday_SansAuth_Retourne401()
    {
        var resp = await _client.DeleteAsync("/api/admin/reset-today");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task ResetToday_AvecDefi_Retourne200()
    {
        // Crée une session d'abord
        await _client.PostAsync("/api/sessions", null);

        var resp = await AdminDeleteAsync("/api/admin/reset-today");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    // ── Admin Stats ───────────────────────────────────────────────────────────

    [Fact]
    public async Task AdminStats_SansAuth_Retourne401()
    {
        var resp = await _client.GetAsync("/api/admin/stats");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task AdminStats_RetourneStructureComplete()
    {
        var resp = await AdminGetAsync("/api/admin/stats");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body);
        Assert.NotNull(body.Challenges);
        Assert.NotNull(body.DailyActivity);
        Assert.NotNull(body.PlayerBreakdown);
    }

    [Fact]
    public async Task AdminStats_ApresPartieComplete_ComptePlayerCountEtPasDesPending()
    {
        var session = await StartSessionAsync();
        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        var resp = await AdminGetAsync("/api/admin/stats");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = body.Challenges.FirstOrDefault(c => c.Date == today);
        Assert.NotNull(todayStats);
        Assert.Equal(1, todayStats.PlayerCount);
        Assert.Equal(0, todayStats.PendingCount);
        Assert.Equal(0, todayStats.AbandonedCount);
        Assert.NotNull(todayStats.ScoreMin);
        Assert.NotNull(todayStats.ScoreMax);
    }

    [Fact]
    public async Task AdminStats_ApresAbandon_CompteAbandonedPasPlayerCount()
    {
        var session = await StartSessionAsync();
        await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);

        var resp = await AdminGetAsync("/api/admin/stats");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = body.Challenges.FirstOrDefault(c => c.Date == today);
        Assert.NotNull(todayStats);
        Assert.Equal(0, todayStats.PlayerCount);
        Assert.Equal(1, todayStats.AbandonedCount);
        Assert.Equal(0, todayStats.PendingCount);
        Assert.Null(todayStats.ScoreMin);
    }

    [Fact]
    public async Task AdminStats_ApresSessionPending_ComptePendingPasPlayerCount()
    {
        var session = await StartSessionAsync();
        await SubmitAsync(session.SessionId, session.Tracks[0].Id, 1m, "X", null);

        var resp = await AdminGetAsync("/api/admin/stats");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = body.Challenges.FirstOrDefault(c => c.Date == today);
        Assert.NotNull(todayStats);
        Assert.Equal(0, todayStats.PlayerCount);
        Assert.Equal(1, todayStats.PendingCount);
        Assert.Equal(0, todayStats.AbandonedCount);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async Task<StartSessionResponse> StartSessionAsync()
    {
        var resp = await _client.PostAsync("/api/sessions", null);
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<StartSessionResponse>())!;
    }

    private Task<HttpResponseMessage> SubmitAsync(
        int sessionId, int trackId, decimal duration, string? artist, string? title)
    {
        return _client.PostAsJsonAsync($"/api/sessions/{sessionId}/answers",
            new SubmitAnswerBody(trackId, duration, false, artist, title));
    }

    private Task<HttpResponseMessage> AdminGetAsync(string url)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        return _client.SendAsync(req);
    }

    private Task<HttpResponseMessage> AdminPostAsync(string url, object body)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        return _client.SendAsync(req);
    }

    private Task<HttpResponseMessage> AdminDeleteAsync(string url)
    {
        var req = new HttpRequestMessage(HttpMethod.Delete, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        return _client.SendAsync(req);
    }

    private sealed record LoginResponse(string Token);
}

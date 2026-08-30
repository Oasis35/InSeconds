using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Features.Admin.Tracks.AddTrack;
using InSeconds.Api.Features.Admin.Tracks.GetTracks;
using InSeconds.Api.Features.Admin.Tracks.UpdateTrack;
using InSeconds.Api.Features.Admin.Challenges.GetChallenges;
using InSeconds.Api.Features.Admin.Stats.GetAdminStats;
using InSeconds.Api.Features.Admin.Stats.GetChallengeStats;
using InSeconds.Api.Features.Players.GetCurrentPlayer;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

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
        // Le seed a 55 tracks : 9 assignées à des défis (J-2, J-1, aujourd'hui) = Used, 46 disponibles
        // (dont 5 morceaux sans preview : IDs >= 9_000_000_000)
        Assert.Equal(46, body.Available.Count);
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

    [Fact]
    public async Task GetChallenges_TitreAvecParentheses_EstNettoye()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var challengeTrack = await db.DailyChallengeTracks
                .Include(t => t.Track)
                .Include(t => t.DailyChallenge)
                .FirstAsync(t => t.DailyChallenge.Date == today && t.Position == 1);
            challengeTrack.Track.Title = "Lose Yourself (Remastered 2013)";
            await db.SaveChangesAsync();
        }

        var resp = await AdminGetAsync("/api/admin/challenges");
        var body = await resp.Content.ReadFromJsonAsync<List<ChallengeDto>>();
        Assert.NotNull(body);

        var todayChallenge = body.Single(c => c.Date == today);
        var track = todayChallenge.Tracks.Single(t => t.Position == 1);
        Assert.Equal("Lose Yourself", track.Title);
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
    public async Task ChallengeStats_SansAuth_Retourne401()
    {
        var resp = await _client.GetAsync("/api/admin/challenge-stats");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task ChallengeStats_RetourneLesTroisDefisDuSeed()
    {
        var challenges = await AdminGetChallengeStatsAsync();
        Assert.Equal(3, challenges.Count);
        Assert.All(challenges, c => Assert.NotEmpty(c.Tracks));
    }

    [Fact]
    public async Task AdminStats_RetourneStructureComplete()
    {
        var resp = await AdminGetAsync("/api/admin/stats");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body);
        Assert.NotNull(body.DailyActivity);
        Assert.NotNull(body.PlayerBreakdown);

        // Les stats par défi vivent dans un endpoint séparé désormais.
        var challenges = await AdminGetChallengeStatsAsync();
        Assert.NotNull(challenges);
    }

    [Fact]
    public async Task AdminStats_TitreAvecParentheses_EstNettoyeDansTrackStatsDto()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var challengeTrack = await db.DailyChallengeTracks
                .Include(t => t.Track)
                .Include(t => t.DailyChallenge)
                .FirstAsync(t => t.DailyChallenge.Date == today && t.Position == 1);
            challengeTrack.Track.Title = "Lose Yourself (Remastered 2013)";
            await db.SaveChangesAsync();
        }

        var challenges = await AdminGetChallengeStatsAsync();

        var todayStats = challenges.Single(c => c.Date == today);
        var track = todayStats.Tracks.Single(t => t.Position == 1);
        Assert.Equal("Lose Yourself", track.Title);
    }

    [Fact]
    public async Task AdminStats_ApresPartieComplete_ComptePlayerCountEtPasDesPending()
    {
        var session = await StartSessionAsync();
        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        var challenges = await AdminGetChallengeStatsAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = challenges.FirstOrDefault(c => c.Date == today);
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

        var challenges = await AdminGetChallengeStatsAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = challenges.FirstOrDefault(c => c.Date == today);
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

        var challenges = await AdminGetChallengeStatsAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = challenges.FirstOrDefault(c => c.Date == today);
        Assert.NotNull(todayStats);
        Assert.Equal(0, todayStats.PlayerCount);
        Assert.Equal(1, todayStats.PendingCount);
        Assert.Equal(0, todayStats.AbandonedCount);
    }

    // ── AdminStats — Players (ChallengeStatsDto.Players) ────────────────────

    [Fact]
    public async Task AdminStats_ApresPartieComplete_PlayersContientLeJoueurAvecStatutCompleted()
    {
        var myId = await MyPlayerIdAsync();
        var session = await StartSessionAsync();
        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        var challenges = await AdminGetChallengeStatsAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = challenges.FirstOrDefault(c => c.Date == today);
        Assert.NotNull(todayStats);

        var myEntry = todayStats.Players.SingleOrDefault(p => p.PlayerId == myId);
        Assert.NotNull(myEntry);
        Assert.Equal("Completed", myEntry.Status);
        // Réponses volontairement fausses (artist="X", title=null, cf. SubmitAsync) — aucune
        // correspondance possible, donc Score=0 par construction (ScoreCalculator.Calculate).
        Assert.Equal(0, myEntry.Score);
    }

    [Fact]
    public async Task AdminStats_TrackStatsDto_ExposeHistogrammeEtNotFound()
    {
        var session = await StartSessionAsync();
        // Bonne réponse sur le morceau 1 (Eminem/Lose Yourself), fausses sur les autres.
        await SubmitAsync(session.SessionId, session.Tracks[0].Id, 1m, "Eminem", "Lose Yourself");
        foreach (var track in session.Tracks.Skip(1))
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        var challenges = await AdminGetChallengeStatsAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = challenges.Single(c => c.Date == today);
        var track1 = todayStats.Tracks.Single(t => t.Position == 1);

        Assert.NotEmpty(track1.GuessTimeDistribution);                        // un bucket par palier autorisé
        Assert.Equal(1, track1.GuessTimeDistribution.Single(b => b.DurationSeconds == 1m).Count);
        Assert.Equal(0, track1.NotFoundCount);

        var track2 = todayStats.Tracks.Single(t => t.Position == 2);
        Assert.All(track2.GuessTimeDistribution, b => Assert.Equal(0, b.Count));
        Assert.Equal(1, track2.NotFoundCount);
    }

    [Fact]
    public async Task AdminStats_ApresAbandon_PlayersContientLeJoueurAvecStatutAbandoned()
    {
        var myId = await MyPlayerIdAsync();
        var session = await StartSessionAsync();
        await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);

        var challenges = await AdminGetChallengeStatsAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = challenges.FirstOrDefault(c => c.Date == today);
        Assert.NotNull(todayStats);

        var myEntry = todayStats.Players.SingleOrDefault(p => p.PlayerId == myId);
        Assert.NotNull(myEntry);
        Assert.Equal("Abandoned", myEntry.Status);
    }

    [Fact]
    public async Task AdminStats_ApresSessionPending_PlayersContientLeJoueurAvecStatutPending()
    {
        var myId = await MyPlayerIdAsync();
        var session = await StartSessionAsync();
        await SubmitAsync(session.SessionId, session.Tracks[0].Id, 1m, "X", null);

        var challenges = await AdminGetChallengeStatsAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var todayStats = challenges.FirstOrDefault(c => c.Date == today);
        Assert.NotNull(todayStats);

        var myEntry = todayStats.Players.SingleOrDefault(p => p.PlayerId == myId);
        Assert.NotNull(myEntry);
        Assert.Equal("Pending", myEntry.Status);
    }

    // ── AdminStats — SelectedDayKpis + AvailableDates + fix 30j ─────────────

    [Fact]
    public async Task AdminStats_RetourneAvailableDatesEtSelectedDayKpis()
    {
        var resp = await AdminGetAsync("/api/admin/stats");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body);

        // Le seed crée 3 défis : J-2, J-1, aujourd'hui
        Assert.NotNull(body.AvailableDates);
        Assert.Equal(3, body.AvailableDates.Count);

        // Sans param date → défaut = aujourd'hui
        Assert.NotNull(body.SelectedDayKpis);
        Assert.Equal(DateOnly.FromDateTime(DateTime.UtcNow), body.SelectedDayKpis.Date);
    }

    [Fact]
    public async Task AdminStats_AvecParamDate_RetourneKpisDuBonJour()
    {
        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
        var resp = await AdminGetAsync($"/api/admin/stats?date={yesterday:yyyy-MM-dd}");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body);

        // Le seed a 1 session Completed pour J-1
        Assert.NotNull(body.SelectedDayKpis);
        Assert.Equal(yesterday, body.SelectedDayKpis.Date);
        Assert.Equal(1, body.SelectedDayKpis.CompletedCount);
        Assert.Equal(0, body.SelectedDayKpis.AbandonedCount);
    }

    [Fact]
    public async Task AdminStats_JourPresent_PendingNePasCompteDansAbandons()
    {
        var session = await StartSessionAsync();
        await SubmitAsync(session.SessionId, session.Tracks[0].Id, 1m, "X", null); // reste Pending

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var resp = await AdminGetAsync($"/api/admin/stats?date={today:yyyy-MM-dd}");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body?.SelectedDayKpis);

        Assert.Equal(0, body.SelectedDayKpis.CompletedCount);
        Assert.Equal(0, body.SelectedDayKpis.AbandonedCount); // Pending du jour → pas compté
        Assert.Equal(1, body.SelectedDayKpis.TotalSessions);
    }

    [Fact]
    public async Task AdminStats_JourPasse_PendingCompteCommeExpired_PasAbandoned()
    {
        // Une session Pending rattachée au défi de J-1 (joueur jamais revenu) doit compter
        // dans ExpiredCount — jamais dans AbandonedCount, réservé au clic « Abandonner ».
        var session = await StartSessionAsync();
        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var gs = await db.GameSessions.FindAsync(session.SessionId);
            var yChallenge = await db.DailyChallenges.FirstAsync(c => c.Date == yesterday);
            gs!.DailyChallengeId = yChallenge.Id;
            await db.SaveChangesAsync();
        }

        var resp = await AdminGetAsync($"/api/admin/stats?date={yesterday:yyyy-MM-dd}");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body?.SelectedDayKpis);

        // KPIs du jour
        Assert.Equal(1, body.SelectedDayKpis.CompletedCount);  // session Completed du seed (dev)
        Assert.Equal(0, body.SelectedDayKpis.AbandonedCount);
        Assert.Equal(1, body.SelectedDayKpis.ExpiredCount);    // le Pending d'un jour passé
        Assert.Equal(0, body.SelectedDayKpis.PendingCount);    // jour passé → jamais "en cours"
        Assert.Equal(2, body.SelectedDayKpis.TotalSessions);

        // Convergence : la section « Stats par défi » reporte les mêmes chiffres
        var challenges = await AdminGetChallengeStatsAsync();
        var yStats = challenges.First(c => c.Date == yesterday);
        Assert.Equal(0, yStats.AbandonedCount);
        Assert.Equal(1, yStats.ExpiredCount);
        Assert.Equal(0, yStats.PendingCount);
    }

    [Fact]
    public async Task AdminStats_ApresAbandonExplicite_CompteAbandonedPasExpired()
    {
        var session = await StartSessionAsync();
        await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var resp = await AdminGetAsync($"/api/admin/stats?date={today:yyyy-MM-dd}");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body?.SelectedDayKpis);

        Assert.Equal(1, body.SelectedDayKpis.AbandonedCount);
        Assert.Equal(0, body.SelectedDayKpis.ExpiredCount);

        var challenges = await AdminGetChallengeStatsAsync();
        var todayStats = challenges.First(c => c.Date == today);
        Assert.Equal(1, todayStats.AbandonedCount);
        Assert.Equal(0, todayStats.ExpiredCount);
    }

    [Fact]
    public async Task AdminStats_DateSansDefi_SelectedDayKpisEstNull()
    {
        var noChallenge = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-10));
        var resp = await AdminGetAsync($"/api/admin/stats?date={noChallenge:yyyy-MM-dd}");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body);
        Assert.Null(body.SelectedDayKpis);
    }

    [Fact]
    public async Task AdminStats_DailyActivityContient30Jours()
    {
        var resp = await AdminGetAsync("/api/admin/stats");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body);

        // Doit toujours retourner exactement 30 entrées (jours vides = 0)
        Assert.Equal(30, body.DailyActivity.Count);
        // Les jours sans activité ont PlayerCount = 0
        Assert.Contains(body.DailyActivity, d => d.PlayerCount == 0);
    }

    [Fact]
    public async Task AdminStats_ApresPartieComplete_KpisDuJourMisAJour()
    {
        var session = await StartSessionAsync();
        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var resp = await AdminGetAsync($"/api/admin/stats?date={today:yyyy-MM-dd}");
        var body = await resp.Content.ReadFromJsonAsync<AdminStatsResponse>();
        Assert.NotNull(body?.SelectedDayKpis);

        Assert.Equal(1, body.SelectedDayKpis.CompletedCount);
        Assert.Equal(0, body.SelectedDayKpis.AbandonedCount);
        Assert.Equal(1, body.SelectedDayKpis.TotalSessions);
        Assert.Equal(100.0, body.SelectedDayKpis.CompletionRate);
        Assert.NotNull(body.SelectedDayKpis.MedianScore);
    }

    [Fact]
    public async Task AdminStats_CompteLie_ChallengePlayerDtoAPseudoRenseigne()
    {
        var session = await StartSessionAsync();
        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        await LinkCurrentClientAsync("allowed@e2e.test", "StatsPseudo");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var challenges = await AdminGetChallengeStatsAsync();
        var challenge = challenges.Single(c => c.Date == today);
        Assert.Contains(challenge.Players, p => p.Pseudo == "StatsPseudo");
    }

    [Fact]
    public async Task AdminStats_ApresConversionCompte_TotalRegisteredIncremente()
    {
        var before = await AdminGetAsync("/api/admin/stats");
        var beforeBody = await before.Content.ReadFromJsonAsync<AdminStatsResponse>();
        var beforeCount = beforeBody!.PlayerBreakdown.TotalRegistered;

        await LinkCurrentClientAsync("allowed@e2e.test", "RegisteredCountTest");

        var after = await AdminGetAsync("/api/admin/stats");
        var afterBody = await after.Content.ReadFromJsonAsync<AdminStatsResponse>();

        Assert.Equal(beforeCount + 1, afterBody!.PlayerBreakdown.TotalRegistered);
    }

    // Convertit le joueur courant de _client (guest) en compte lié, via le vrai flow
    // magic link (request + capture via TestEmailCapture, puisque le token brut n'est
    // jamais stocké en base).
    private async Task LinkCurrentClientAsync(string email, string pseudo)
    {
        await _client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = email });
        var capture = factory.Services.GetRequiredService<InSeconds.Api.Common.Email.TestEmailCapture>();
        Assert.True(capture.TryGetLast(email, out var lastEmail));
        var match = System.Text.RegularExpressions.Regex.Match(lastEmail.Html, "token=([^&\"]+)");
        Assert.True(match.Success);
        await _client.PostAsJsonAsync("/api/auth/magic-link/verify", new { Token = match.Groups[1].Value, Pseudo = pseudo });
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async Task<Guid> MyPlayerIdAsync()
    {
        var resp = await _client.GetAsync("/api/players/me");
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<GetCurrentPlayerResponse>();
        return body!.PlayerId;
    }

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

    // « Stats par défi » — endpoint scindé de /api/admin/stats (cf. GetChallengeStats).
    private async Task<IReadOnlyList<ChallengeStatsDto>> AdminGetChallengeStatsAsync()
    {
        var resp = await AdminGetAsync("/api/admin/challenge-stats");
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<ChallengeStatsResponse>();
        Assert.NotNull(body);
        return body.Challenges;
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

    private Task<HttpResponseMessage> AdminPutAsync(string url, object body)
    {
        var req = new HttpRequestMessage(HttpMethod.Put, url)
        {
            Content = JsonContent.Create(body)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        return _client.SendAsync(req);
    }

    // ── DeleteTrack ───────────────────────────────────────────────────────────

    [Fact]
    public async Task DeleteTrack_SansAuth_Retourne401()
    {
        var resp = await _client.DeleteAsync("/api/admin/tracks/1");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task DeleteTrack_TrackDisponible_Retourne200()
    {
        var addResp = await AdminPostAsync("/api/admin/tracks", new { DeezerTrackId = FakeDeezerTrackId });
        var addBody = await addResp.Content.ReadFromJsonAsync<AddTrackResponse>();
        var trackId = addBody!.Id;

        var resp = await AdminDeleteAsync($"/api/admin/tracks/{trackId}");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var getResp = await AdminGetAsync("/api/admin/tracks");
        var getTracks = await getResp.Content.ReadFromJsonAsync<GetTracksResponse>();
        Assert.DoesNotContain(getTracks!.Available, t => t.Id == trackId);
    }

    [Fact]
    public async Task DeleteTrack_TrackUtiliseDansDefi_Retourne409()
    {
        // ExistingDeezerTrackId est dans le seed et assigné à un défi
        var getResp = await AdminGetAsync("/api/admin/tracks");
        var tracks = await getResp.Content.ReadFromJsonAsync<GetTracksResponse>();
        var usedTrackId = tracks!.Used.First().Id;

        var resp = await AdminDeleteAsync($"/api/admin/tracks/{usedTrackId}");

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task DeleteTrack_TrackInexistant_Retourne404()
    {
        var resp = await AdminDeleteAsync("/api/admin/tracks/99999");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── UpdateTrack ───────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateTrack_SansAuth_Retourne401()
    {
        var resp = await _client.PutAsJsonAsync("/api/admin/tracks/1", new { DeezerTrackId = FakeDeezerTrackId });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task UpdateTrack_TrackDisponible_Retourne200()
    {
        var addResp = await AdminPostAsync("/api/admin/tracks", new { DeezerTrackId = FakeDeezerTrackId });
        var addBody = await addResp.Content.ReadFromJsonAsync<AddTrackResponse>();
        var trackId = addBody!.Id;

        const long newDeezerTrackId = 99999998L;
        var resp = await AdminPutAsync($"/api/admin/tracks/{trackId}", new { DeezerTrackId = newDeezerTrackId });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<UpdateTrackResponse>();
        Assert.NotNull(body);
        Assert.Equal(newDeezerTrackId, body.DeezerTrackId);
        Assert.NotEmpty(body.Artist);
        Assert.NotEmpty(body.Title);
    }

    [Fact]
    public async Task UpdateTrack_TrackUtiliseDansDefi_Retourne409()
    {
        var getResp = await AdminGetAsync("/api/admin/tracks");
        var tracks = await getResp.Content.ReadFromJsonAsync<GetTracksResponse>();
        var usedTrackId = tracks!.Used.First().Id;

        var resp = await AdminPutAsync($"/api/admin/tracks/{usedTrackId}", new { DeezerTrackId = FakeDeezerTrackId });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task UpdateTrack_DeezerIdDejaUtilise_Retourne409()
    {
        var resp1 = await AdminPostAsync("/api/admin/tracks", new { DeezerTrackId = FakeDeezerTrackId });
        var body1 = await resp1.Content.ReadFromJsonAsync<AddTrackResponse>();

        var resp2 = await AdminPostAsync("/api/admin/tracks", new { DeezerTrackId = 99999997L });
        var body2 = await resp2.Content.ReadFromJsonAsync<AddTrackResponse>();

        var resp = await AdminPutAsync($"/api/admin/tracks/{body2!.Id}", new { DeezerTrackId = FakeDeezerTrackId });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task UpdateTrack_TrackInexistant_Retourne404()
    {
        var resp = await AdminPutAsync("/api/admin/tracks/99999", new { DeezerTrackId = FakeDeezerTrackId });

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    private sealed record LoginResponse(string Token);
}

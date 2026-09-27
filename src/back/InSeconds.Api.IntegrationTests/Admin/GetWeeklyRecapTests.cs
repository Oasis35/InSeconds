using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using InSeconds.Api.Common.Email;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.Stats.GetWeeklyRecap;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests.Admin;

// GET /api/admin/weekly-recap : morceau le plus trouvé / le plus raté des 7 derniers jours
// (stories Instagram). Les réponses sont insérées directement en base (un invité + une session
// complétée par réponse) sur les défis du seed (aujourd'hui, J-1, J-2).
[Collection("Integration")]
public class GetWeeklyRecapTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private const string AdminEmail = "weekly-admin@example.com";
    // Défi créé par un test hors de la fenêtre de 7 jours — supprimé au DisposeAsync car la table
    // DailyChallenges n'est pas vidée par le reset Respawn (données de référence du seed).
    private static readonly DateOnly OutOfWindowDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-8);

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    public Task InitializeAsync() => factory.ResetAsync();

    public async Task DisposeAsync()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.GameSessionAnswers.Where(a => a.Track.DailyChallenge.Date == OutOfWindowDate).ExecuteDeleteAsync();
        await db.GameSessions.Where(s => s.DailyChallenge.Date == OutOfWindowDate).ExecuteDeleteAsync();
        await db.DailyChallengeTracks.Where(t => t.DailyChallenge.Date == OutOfWindowDate).ExecuteDeleteAsync();
        await db.DailyChallenges.Where(c => c.Date == OutOfWindowDate).ExecuteDeleteAsync();
    }

    [Fact]
    public async Task Recap_ClasseLePlusTrouveEtLePlusRate()
    {
        var admin = await CreateAdminClientAsync();

        // Aujourd'hui, position 1 : 3/3 trouvés (100 %).
        await SeedAnswersAsync(Today, 1, (true, true), (true, true), (true, true));
        // J-2, position 2 : 1/4 (artiste seul ne compte pas) → 25 %.
        await SeedAnswersAsync(Today.AddDays(-2), 2, (true, true), (true, false), (false, true), (false, false));
        // J-1, position 3 : 2/4 → 50 %.
        await SeedAnswersAsync(Today.AddDays(-1), 3, (true, true), (true, true), (false, false), (false, false));

        var body = await admin.GetFromJsonAsync<WeeklyRecapResponse>("/api/admin/weekly-recap");

        Assert.NotNull(body);
        Assert.Equal(WeeklyRecapStatus.Ok, body.Status);
        Assert.Equal(Today, body.To);
        Assert.Equal(Today.AddDays(-6), body.From);
        Assert.Equal(GetWeeklyRecapEndpoint.MinAnswers, body.MinAnswers);

        var expectedFound = await GetTrackAsync(Today, 1);
        Assert.NotNull(body.MostFound);
        Assert.Equal(expectedFound.Artist, body.MostFound.Artist);
        Assert.Equal(100, body.MostFound.SuccessRatePercent);
        Assert.Equal(3, body.MostFound.Answers);

        var expectedMissed = await GetTrackAsync(Today.AddDays(-2), 2);
        Assert.NotNull(body.MostMissed);
        Assert.Equal(expectedMissed.Artist, body.MostMissed.Artist);
        Assert.Equal(25, body.MostMissed.SuccessRatePercent);
        Assert.Equal(4, body.MostMissed.Answers);

    }

    [Fact]
    public async Task Recap_ExclutLesMorceauxAvecMoinsDe3Reponses()
    {
        var admin = await CreateAdminClientAsync();

        // 2 réponses parfaites : échantillon trop faible, ignoré malgré ses 100 %.
        await SeedAnswersAsync(Today, 1, (true, true), (true, true));
        await SeedAnswersAsync(Today, 2, (true, true), (false, false), (false, false));
        await SeedAnswersAsync(Today, 3, (false, false), (false, false), (false, false));

        var body = await admin.GetFromJsonAsync<WeeklyRecapResponse>("/api/admin/weekly-recap");

        Assert.NotNull(body);
        Assert.Equal((await GetTrackAsync(Today, 2)).Artist, body.MostFound!.Artist);
        Assert.Equal((await GetTrackAsync(Today, 3)).Artist, body.MostMissed!.Artist);
    }

    [Fact]
    public async Task Recap_PasAssezDeReponses_StatutInsufficientData()
    {
        var admin = await CreateAdminClientAsync();
        await SeedAnswersAsync(Today, 1, (true, true), (false, false));

        var resp = await admin.GetAsync("/api/admin/weekly-recap");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<WeeklyRecapResponse>();
        Assert.NotNull(body);
        Assert.Equal(WeeklyRecapStatus.InsufficientData, body.Status);
        Assert.Null(body.MostFound);
        Assert.Null(body.MostMissed);
    }

    [Fact]
    public async Task Recap_UnSeulMorceauEligible_PasDePlusRate()
    {
        var admin = await CreateAdminClientAsync();
        await SeedAnswersAsync(Today, 1, (true, true), (false, false), (false, false));

        var body = await admin.GetFromJsonAsync<WeeklyRecapResponse>("/api/admin/weekly-recap");

        Assert.NotNull(body);
        Assert.Equal(WeeklyRecapStatus.Ok, body.Status);
        Assert.NotNull(body.MostFound);
        Assert.Null(body.MostMissed);
    }

    [Fact]
    public async Task Recap_IgnoreLesDefisHorsDeLaFenetre()
    {
        var admin = await CreateAdminClientAsync();
        await CreateChallengeAsync(OutOfWindowDate, await GetTrackAsync(Today, 4));
        await SeedAnswersAsync(OutOfWindowDate, 1, (true, true), (true, true), (true, true));

        var body = await admin.GetFromJsonAsync<WeeklyRecapResponse>("/api/admin/weekly-recap");

        Assert.NotNull(body);
        Assert.Equal(WeeklyRecapStatus.InsufficientData, body.Status);
    }

    [Fact]
    public async Task Recap_CompteNonAdmin_Retourne401()
    {
        var client = factory.CreateClient();
        await LinkPlayerAsync(client, "weekly-member@example.com", "PasAdmin");

        var resp = await client.GetAsync("/api/admin/weekly-recap");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async Task<HttpClient> CreateAdminClientAsync()
    {
        var admin = factory.CreateClient();
        await LinkPlayerAsync(admin, AdminEmail, "ChefStories");
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var player = await db.Players.SingleAsync(p => p.Email == AdminEmail);
        player.PromoteToAdminForTesting();
        await db.SaveChangesAsync();
        return admin;
    }

    // Une réponse = un invité + une session complétée sur le défi du jour donné.
    private async Task SeedAnswersAsync(DateOnly date, int position, params (bool Artist, bool Title)[] answers)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var challengeTrack = await db.DailyChallengeTracks
            .SingleAsync(t => t.DailyChallenge.Date == date && t.Position == position);
        var now = DateTime.UtcNow;

        foreach (var (artist, title) in answers)
        {
            var player = Player.CreateGuest(Guid.NewGuid(), Guid.NewGuid(), now);
            db.Players.Add(player);
            var session = GameSession.StartNew(player.Id, challengeTrack.DailyChallengeId, now);
            var score = artist && title ? 850 : 0;
            session.AddAnswerScore(score, 1m);
            session.Complete(now);
            session.Answers.Add(new GameSessionAnswer
            {
                DailyChallengeTrackId = challengeTrack.Id,
                ListenedDurationSeconds = 1m,
                ArtistCorrect = artist,
                TitleCorrect = title,
                Score = score,
            });
            db.GameSessions.Add(session);
        }
        await db.SaveChangesAsync();
    }

    private async Task<Track> GetTrackAsync(DateOnly date, int position)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.DailyChallengeTracks
            .Where(t => t.DailyChallenge.Date == date && t.Position == position)
            .Select(t => t.Track)
            .SingleAsync();
    }

    private async Task CreateChallengeAsync(DateOnly date, Track track)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var challenge = new DailyChallenge { Date = date, Seed = 0 };
        challenge.Tracks.Add(new DailyChallengeTrack { TrackId = track.Id, Position = 1 });
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();
    }

    private async Task LinkPlayerAsync(HttpClient client, string email, string pseudo)
    {
        client.DefaultRequestHeaders.Remove("Origin");
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");

        await client.PostAsJsonAsync("/api/auth/magic-link/request", new { Email = email });

        var capture = factory.Services.GetRequiredService<TestEmailCapture>();
        Assert.True(capture.TryGetLast(email, out var lastEmail));

        var match = Regex.Match(lastEmail.Html, "href=\"([^\"]+)\"");
        Assert.True(match.Success);
        var tokenMatch = Regex.Match(match.Groups[1].Value, "token=([^&]+)");
        Assert.True(tokenMatch.Success);

        var resp = await client.PostAsJsonAsync("/api/auth/magic-link/verify",
            new { Token = tokenMatch.Groups[1].Value, Pseudo = pseudo });
        resp.EnsureSuccessStatusCode();
    }
}

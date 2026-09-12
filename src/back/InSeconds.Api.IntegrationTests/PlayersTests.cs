using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Players.GetCurrentPlayer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
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
        Assert.Equal(0, body.CurrentStreak);
        Assert.Equal(0, body.GamesPlayed);
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

    [Fact]
    public async Task GetCurrentPlayer_GamesPlayed_NeCompteQueLesSessionsCompleted()
    {
        var client = factory.CreateClient();
        var me = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me");
        Assert.NotNull(me);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var challenges = await db.DailyChallenges.OrderBy(c => c.Date).Take(3).ToListAsync();
            Assert.True(challenges.Count >= 3, "Le seed E2E doit fournir au moins 3 DailyChallenges (J-2/J-1/aujourd'hui).");

            db.GameSessions.AddRange(
                new GameSession { PlayerId = me.PlayerId, DailyChallengeId = challenges[0].Id, Status = SessionStatus.Completed, TotalScore = 100, CreatedAt = DateTime.UtcNow, CompletedAt = DateTime.UtcNow },
                new GameSession { PlayerId = me.PlayerId, DailyChallengeId = challenges[1].Id, Status = SessionStatus.Abandoned, TotalScore = 0, CreatedAt = DateTime.UtcNow, AbandonedAt = DateTime.UtcNow },
                new GameSession { PlayerId = me.PlayerId, DailyChallengeId = challenges[2].Id, Status = SessionStatus.Pending, TotalScore = 0, CreatedAt = DateTime.UtcNow }
            );
            await db.SaveChangesAsync();
        }

        var updated = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me");

        Assert.NotNull(updated);
        Assert.Equal(1, updated.GamesPlayed);
    }
}

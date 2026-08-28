using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Features.Sessions.GetTodaySession;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests;

/// <summary>
/// GET /api/sessions/today — le "peek" lecture seule qui pilote l'écran d'accueil
/// sans jamais créer de Player, de cookie ni de session.
/// </summary>
[Collection("Integration")]
public class GetTodaySessionTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private static async Task<int> PlayerCountAsync(IntegrationTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Players.IgnoreQueryFilters().CountAsync();
    }

    [Fact]
    public async Task Peek_SansCookie_RetourneCanStart_SansCreerNiCookieNiPlayer()
    {
        var before = await PlayerCountAsync(factory);

        // Client neuf → aucun cookie authToken
        var freshClient = factory.CreateClient();
        var resp = await freshClient.GetAsync("/api/sessions/today");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.DoesNotContain(resp.Headers, h => h.Key.Equals("Set-Cookie", StringComparison.OrdinalIgnoreCase));

        var body = await resp.Content.ReadFromJsonAsync<GetTodaySessionResponse>();
        Assert.NotNull(body);
        Assert.Equal("can_start", body.State);
        Assert.Equal(3, body.TracksCount);
        Assert.Equal(0, body.CompletedCount);

        // Aucun Player créé
        Assert.Equal(before, await PlayerCountAsync(factory));
    }

    [Fact]
    public async Task Peek_ApresStartSession_RetourneResumable_AvecCompletedCount()
    {
        var start = await _client.PostAsync("/api/sessions", null);
        start.EnsureSuccessStatusCode();
        var session = (await start.Content.ReadFromJsonAsync<StartSessionResponse>())!;

        // Répondre à 1 morceau (session reste Pending)
        await _client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
            new SubmitAnswerBody(session.Tracks[0].Id, 1m, false, "X", null));

        var resp = await _client.GetAsync("/api/sessions/today");
        var body = await resp.Content.ReadFromJsonAsync<GetTodaySessionResponse>();

        Assert.NotNull(body);
        Assert.Equal("resumable", body.State);
        Assert.Equal(3, body.TracksCount);
        Assert.Equal(1, body.CompletedCount);
    }

    [Fact]
    public async Task Peek_ApresPartieComplete_RetourneAlreadyPlayed()
    {
        var start = await _client.PostAsync("/api/sessions", null);
        var session = (await start.Content.ReadFromJsonAsync<StartSessionResponse>())!;
        foreach (var t in session.Tracks)
            await _client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
                new SubmitAnswerBody(t.Id, 1m, false, "X", null));

        var resp = await _client.GetAsync("/api/sessions/today");
        var body = await resp.Content.ReadFromJsonAsync<GetTodaySessionResponse>();

        Assert.NotNull(body);
        Assert.Equal("already_played", body.State);
    }

    [Fact]
    public async Task Peek_ApresAbandonExplicite_RetourneAbandoned()
    {
        var start = await _client.PostAsync("/api/sessions", null);
        var session = (await start.Content.ReadFromJsonAsync<StartSessionResponse>())!;
        await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);

        var resp = await _client.GetAsync("/api/sessions/today");
        var body = await resp.Content.ReadFromJsonAsync<GetTodaySessionResponse>();

        Assert.NotNull(body);
        Assert.Equal("abandoned", body.State);
    }

    [Fact]
    public async Task Peek_NeCreeJamaisDeSession()
    {
        async Task<int> SessionCount()
        {
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            return await db.GameSessions.IgnoreQueryFilters().CountAsync();
        }

        var before = await SessionCount(); // sessions du seed (dev player)

        for (var i = 0; i < 3; i++)
            await factory.CreateClient().GetAsync("/api/sessions/today");

        Assert.Equal(before, await SessionCount());
    }
}

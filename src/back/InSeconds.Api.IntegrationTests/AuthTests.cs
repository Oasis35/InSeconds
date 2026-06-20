using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Features.Auth.Me;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using Microsoft.Extensions.DependencyInjection;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class AuthTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── GET /api/auth/me ─────────────────────────────────────────────────────

    [Fact]
    public async Task Me_PremierAppel_CreeeJoueurGuestEtRetourneId()
    {
        var resp = await _client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<MeResponse>();
        Assert.NotNull(body);
        Assert.True(body.IsGuest);
        Assert.Null(body.Pseudo);
        Assert.NotEqual(Guid.Empty, body.Id);
    }

    [Fact]
    public async Task Me_DeuxiemeAppel_RetourneMemeJoueur()
    {
        var resp1 = await _client.GetAsync("/api/auth/me");
        var resp2 = await _client.GetAsync("/api/auth/me");

        var body1 = await resp1.Content.ReadFromJsonAsync<MeResponse>();
        var body2 = await resp2.Content.ReadFromJsonAsync<MeResponse>();

        Assert.NotNull(body1);
        Assert.NotNull(body2);
        // Même cookie → même PlayerId
        Assert.Equal(body1.Id, body2.Id);
    }

    [Fact]
    public async Task Me_ApresStartSession_RetourneJoueurCoherent()
    {
        // StartSession crée un joueur guest via le middleware
        var sessionResp = await _client.PostAsync("/api/sessions", null);
        sessionResp.EnsureSuccessStatusCode();

        var meResp = await _client.GetAsync("/api/auth/me");
        var me = await meResp.Content.ReadFromJsonAsync<MeResponse>();

        Assert.NotNull(me);
        Assert.True(me.IsGuest);
        Assert.NotEqual(Guid.Empty, me.Id);
    }

    // ── Soft-delete ──────────────────────────────────────────────────────────

    [Fact]
    public async Task SoftDelete_JoueurSupprime_SessionsAbsentesDesStats()
    {
        // Jouer une partie complète
        var sessionResp = await _client.PostAsync("/api/sessions", null);
        var session = await sessionResp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);

        foreach (var track in session.Tracks)
            await _client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
                new SubmitAnswerBody(track.Id, 1m, false, "X", null));

        // Vérifier que le joueur apparaît dans les stats avant suppression
        var statsBefore = await _client.GetAsync("/api/stats/today");
        var bodyBefore = await statsBefore.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(1, bodyBefore.GetProperty("totalPlayers").GetInt32());

        // Soft-delete du joueur directement en base
        var meResp = await _client.GetAsync("/api/auth/me");
        var me = await meResp.Content.ReadFromJsonAsync<MeResponse>();
        Assert.NotNull(me);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var player = await db.Players.FirstAsync(p => p.Id == me.Id);
        player.IsDeleted = true;
        await db.SaveChangesAsync();

        // Un nouveau client sans cookie (nouveau joueur guest) lit les stats
        var freshClient = factory.CreateClient();
        var statsAfter = await freshClient.GetAsync("/api/stats/today");
        var bodyAfter = await statsAfter.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();

        // Le joueur supprimé ne doit plus apparaître dans les stats
        Assert.Equal(0, bodyAfter.GetProperty("totalPlayers").GetInt32());
    }

    [Fact]
    public async Task SoftDelete_JoueurSupprime_NouveauAppelCreeeNouveauGuest()
    {
        var me1 = await _client.GetAsync("/api/auth/me");
        var player1 = await me1.Content.ReadFromJsonAsync<MeResponse>();
        Assert.NotNull(player1);

        // Soft-delete
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var player = await db.Players.FirstAsync(p => p.Id == player1.Id);
        player.IsDeleted = true;
        await db.SaveChangesAsync();

        // Nouveau client (cookie différent) → nouveau guest
        var freshClient = factory.CreateClient();
        var me2 = await freshClient.GetAsync("/api/auth/me");
        var player2 = await me2.Content.ReadFromJsonAsync<MeResponse>();

        Assert.NotNull(player2);
        Assert.NotEqual(player1.Id, player2.Id);
        Assert.True(player2.IsGuest);
    }
}

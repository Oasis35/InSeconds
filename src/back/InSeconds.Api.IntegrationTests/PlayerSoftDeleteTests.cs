using System.Net.Http.Json;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using Microsoft.Extensions.DependencyInjection;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class PlayerSoftDeleteTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

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

        // Soft-delete du joueur directement en base (identifié via sa session)
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var playerId = await db.GameSessions
            .Where(s => s.Id == session.SessionId)
            .Select(s => s.PlayerId)
            .FirstAsync();
        var player = await db.Players.FirstAsync(p => p.Id == playerId);
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
        // N'importe quel appel non-admin déclenche la création du guest via le middleware
        await _client.GetAsync("/api/settings");

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var player1 = await db.Players.SingleAsync();

        // Soft-delete
        player1.IsDeleted = true;
        await db.SaveChangesAsync();

        // Nouveau client (cookie différent) → nouveau guest
        var freshClient = factory.CreateClient();
        await freshClient.GetAsync("/api/settings");

        var player2 = await db.Players.FirstAsync(p => p.Id != player1.Id);

        Assert.NotEqual(player1.Id, player2.Id);
        Assert.True(player2.IsGuest);
    }
}

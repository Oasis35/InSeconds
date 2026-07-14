using System.Net;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;

namespace InSeconds.Api.IntegrationTests;

// Génération paresseuse : si le job de minuit a raté, le premier StartSession
// régénère le défi du jour à la volée (filet de sécurité du piège 19).
[Collection("Integration")]
public class LazyChallengeGenerationTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task StartSession_SansDefiDuJour_LeRegenereALaVolee()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await DeleteTodayChallengeAsync(today);

        var resp = await _client.PostAsync("/api/sessions", null);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var session = await resp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);
        Assert.NotEmpty(session.Tracks);

        // Le défi a bien été persisté (pas juste une réponse en mémoire)
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var challenge = await db.DailyChallenges.FirstOrDefaultAsync(c => c.Date == today);
        Assert.NotNull(challenge);
    }

    [Fact]
    public async Task StartSession_SansDefiEtPoolInsuffisant_Retourne503()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await DeleteTodayChallengeAsync(today);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Tracks.ExecuteUpdateAsync(s => s.SetProperty(t => t.HasPreview, false));

        try
        {
            var resp = await _client.PostAsync("/api/sessions", null);

            Assert.Equal(HttpStatusCode.ServiceUnavailable, resp.StatusCode);
        }
        finally
        {
            // Tracks et DailyChallenges sont exclus du reset Respawn : restaurer
            // les flags (convention du seed) et le défi du jour pour les tests suivants.
            await db.Tracks.ExecuteUpdateAsync(
                s => s.SetProperty(t => t.HasPreview, t => t.DeezerTrackId < 9_000_000_000));
            await scope.ServiceProvider
                .GetRequiredService<DailyChallengeGenerator>()
                .GenerateAsync();
        }
    }

    // ── helper ───────────────────────────────────────────────────────────────

    private async Task DeleteTodayChallengeAsync(DateOnly today)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var challenge = await db.DailyChallenges.FirstOrDefaultAsync(c => c.Date == today);
        if (challenge != null)
        {
            db.DailyChallenges.Remove(challenge);
            await db.SaveChangesAsync();
        }
    }
}

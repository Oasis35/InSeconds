using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Features.Admin.Challenges.GetChallenges;
using Microsoft.Extensions.DependencyInjection;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class ChallengeGenerationTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task GenerateToday_DefiDejaExistant_Retourne409()
    {
        // Le seed a déjà créé le défi du jour
        var resp = await AdminPostAsync("/api/admin/generate-today", null);

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task GenerateToday_SansAuth_Retourne401()
    {
        var resp = await _client.PostAsync("/api/admin/generate-today", null);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task DailyChallengeGenerator_CreeLeDéfi_AvecLeBonNombreDeMorceaux()
    {
        // Supprime le défi du jour pour pouvoir en générer un nouveau
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var challenge = await db.DailyChallenges.FirstOrDefaultAsync(c => c.Date == today);
        if (challenge != null)
        {
            db.DailyChallenges.Remove(challenge);
            await db.SaveChangesAsync();
        }

        var generator = scope.ServiceProvider.GetRequiredService<DailyChallengeGenerator>();
        var generated = await generator.GenerateAsync();

        Assert.True(generated);

        // Vérifie que le défi a bien été créé avec 3 morceaux (TracksPerChallenge = 3 par défaut)
        var created = await db.DailyChallenges
            .Include(c => c.Tracks)
            .FirstOrDefaultAsync(c => c.Date == today);
        Assert.NotNull(created);
        Assert.Equal(3, created.Tracks.Count);
    }

    [Fact]
    public async Task DailyChallengeGenerator_DefiDejaExistant_RetourneFalse()
    {
        // Le seed a déjà créé le défi du jour
        using var scope = factory.Services.CreateScope();
        var generator = scope.ServiceProvider.GetRequiredService<DailyChallengeGenerator>();

        var generated = await generator.GenerateAsync();

        Assert.False(generated);
    }

    // ── helper ───────────────────────────────────────────────────────────────

    private Task<HttpResponseMessage> AdminPostAsync(string url, object? body)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = body is not null ? JsonContent.Create(body) : null
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        return _client.SendAsync(req);
    }
}

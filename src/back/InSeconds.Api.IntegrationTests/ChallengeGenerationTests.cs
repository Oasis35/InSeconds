using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Domain;
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
        var result = await generator.GenerateAsync();

        Assert.Equal(GenerateResult.Success, result);

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

        var result = await generator.GenerateAsync();

        Assert.Equal(GenerateResult.AlreadyExists, result);
    }

    [Fact]
    public async Task DailyChallengeGenerator_RespecteLeCooldown_ExcludesTracksRecentesEtStampeLesSelectionnes()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var existingChallenge = await db.DailyChallenges.FirstOrDefaultAsync(c => c.Date == today);
        if (existingChallenge != null)
        {
            db.DailyChallenges.Remove(existingChallenge);
            await db.SaveChangesAsync();
        }

        // Un morceau récemment utilisé (dans le cooldown par défaut de 30j) ne doit jamais être sélectionné,
        // même si tout le reste du pool était insuffisant sans lui.
        var recentlyUsed = await db.Tracks.FirstAsync(t => t.HasPreview && !db.DailyChallengeTracks.Any(dct => dct.TrackId == t.Id));
        recentlyUsed.LastUsedDate = today.AddDays(-5);
        var preGenerationUsageCount = recentlyUsed.UsageCount;
        await db.SaveChangesAsync();

        var generator = scope.ServiceProvider.GetRequiredService<DailyChallengeGenerator>();
        var result = await generator.GenerateAsync();

        Assert.Equal(GenerateResult.Success, result);

        var created = await db.DailyChallenges
            .Include(c => c.Tracks)
            .FirstOrDefaultAsync(c => c.Date == today);
        Assert.NotNull(created);
        Assert.DoesNotContain(created.Tracks, dct => dct.TrackId == recentlyUsed.Id);

        foreach (var dct in created.Tracks)
        {
            var track = await db.Tracks.SingleAsync(t => t.Id == dct.TrackId);
            Assert.Equal(today, track.LastUsedDate);
            Assert.True(track.UsageCount >= 1);
        }

        db.ChangeTracker.Clear();
        var untouched = await db.Tracks.SingleAsync(t => t.Id == recentlyUsed.Id);
        Assert.Equal(preGenerationUsageCount, untouched.UsageCount);
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

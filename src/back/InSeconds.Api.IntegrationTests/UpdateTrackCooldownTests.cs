using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Features.Admin.Settings.UpdateTrackCooldown;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class UpdateTrackCooldownTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Put_WithoutAdminAuth_Returns401()
    {
        var resp = await _client.PutAsJsonAsync(
            "/api/admin/settings/track-cooldown-days",
            new { TrackCooldownDays = 45 });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Put_WithValidValue_PersistsAndReturns200()
    {
        var resp = await AdminPutAsync("/api/admin/settings/track-cooldown-days", new { TrackCooldownDays = 45 });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<UpdateTrackCooldownResponse>();
        Assert.Equal(45, body!.TrackCooldownDays);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var setting = await db.Settings.SingleAsync(s => s.Key == "TrackCooldownDays");
        Assert.Equal("45", setting.Value);
    }

    [Fact]
    public async Task Put_WithInvalidValue_Returns400()
    {
        var resp = await AdminPutAsync("/api/admin/settings/track-cooldown-days", new { TrackCooldownDays = 0 });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Put_ThenGenerateToday_UsesNewCooldownValue()
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

        // Force le pool éligible à exactement 3 morceaux (TracksPerChallenge par défaut) :
        // 2 tracks neutres jamais utilisées + 1 track utilisée il y a 10 jours. Avec le cooldown
        // par défaut (30j) cette dernière serait exclue (pool insuffisant) ; une fois le cooldown
        // réduit à 5j via l'endpoint, elle redevient le 3e candidat et doit obligatoirement être
        // sélectionnée (seule combinaison possible pour former un défi de 3 morceaux).
        // Note : le générateur ne filtre plus sur "appartient à un défi" (c'est tout le principe
        // du cooldown) — donc TOUTES les tracks avec preview, y compris celles des défis J-2/J-1
        // encore en base, doivent être mises en cooldown pour isoler les 3 candidats voulus.
        var allWithPreview = await db.Tracks.Where(t => t.HasPreview).ToListAsync();
        var target = allWithPreview[0];
        var keepEligible = allWithPreview.Skip(1).Take(2).ToList();
        var keepIds = new HashSet<int> { target.Id, keepEligible[0].Id, keepEligible[1].Id };

        target.LastUsedDate = today.AddDays(-10);
        foreach (var other in allWithPreview.Where(t => !keepIds.Contains(t.Id)))
            other.LastUsedDate = today; // en cooldown quel que soit le nombre de jours choisi
        await db.SaveChangesAsync();

        var putResp = await AdminPutAsync("/api/admin/settings/track-cooldown-days", new { TrackCooldownDays = 5 });
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        var generator = scope.ServiceProvider.GetRequiredService<DailyChallengeGenerator>();
        var result = await generator.GenerateAsync();

        Assert.Equal(GenerateResult.Success, result);

        var created = await db.DailyChallenges
            .Include(c => c.Tracks)
            .FirstAsync(c => c.Date == today);

        Assert.Contains(created.Tracks, dct => dct.TrackId == target.Id);
    }

    // ── helper ───────────────────────────────────────────────────────────────

    private Task<HttpResponseMessage> AdminPutAsync(string url, object body)
    {
        var req = new HttpRequestMessage(HttpMethod.Put, url)
        {
            Content = JsonContent.Create(body)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        return _client.SendAsync(req);
    }
}

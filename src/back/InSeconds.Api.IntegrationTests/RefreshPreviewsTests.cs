using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Features.Admin.RefreshPreviews;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class RefreshPreviewsTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task RefreshPreviews_SansAuth_Retourne401()
    {
        var resp = await _client.PostAsync("/api/admin/refresh-previews", null);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task RefreshPreviews_SeedCoherent_RetourneCompteursSansModification()
    {
        // Le seed a 40 tracks hors défi, dont 2 encore en cooldown (utilisées il y a 5 et 15 jours),
        // et 15 tracks des défis J-2/J-1/aujourd'hui, elles aussi en cooldown : 38 à vérifier.
        // Flags déjà cohérents avec le FakeDeezerHandler : rien à corriger, aucun échec.
        // Cooldown remis explicitement à 30j : le reseed ne touche pas la table Settings, et
        // UpdateTrackCooldownTests peut l'avoir modifié dans la même collection.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Settings
                .Where(s => s.Key == "TrackCooldownDays")
                .ExecuteUpdateAsync(u => u.SetProperty(s => s.Value, "30"));
        }

        var resp = await AdminPostAsync("/api/admin/refresh-previews");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<RefreshPreviewsResponse>();
        Assert.NotNull(body);
        Assert.Equal(38, body.Checked);
        Assert.Equal(0, body.Updated);
        Assert.Equal(0, body.Failed);
    }

    [Fact]
    public async Task RefreshPreviews_FlagCorrompu_EstRepare()
    {
        // Simule le bug prod : un track valide (preview dispo côté Deezer) marqué à tort HasPreview = false.
        int corruptedId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var usedIds = await db.DailyChallengeTracks.Select(dct => dct.TrackId).ToListAsync();
            var track = await db.Tracks
                .Where(t => t.DeezerTrackId < 9_000_000_000L && !usedIds.Contains(t.Id) && t.LastUsedDate == null)
                .OrderBy(t => t.Id)
                .FirstAsync();
            track.HasPreview = false;
            corruptedId = track.Id;
            await db.SaveChangesAsync();
        }

        var resp = await AdminPostAsync("/api/admin/refresh-previews");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<RefreshPreviewsResponse>();
        Assert.NotNull(body);
        Assert.Equal(1, body.Updated);

        using var verifyScope = factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var repaired = await verifyDb.Tracks.SingleAsync(t => t.Id == corruptedId);
        Assert.True(repaired.HasPreview);
    }

    private Task<HttpResponseMessage> AdminPostAsync(string url)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        return _client.SendAsync(req);
    }
}

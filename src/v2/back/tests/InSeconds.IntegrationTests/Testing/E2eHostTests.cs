using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Testing.E2E;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Testing;

/// <summary>Seed réaliste, usage simulé des morceaux, <c>reseed</c> et <c>login-as-admin</c> de l'hôte de test.</summary>
public class E2eHostTests(PostgresFixture postgres) : IAsyncLifetime
{
    private TestingFactory _host = null!;

    public async ValueTask InitializeAsync() => _host = new TestingFactory(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _host.DisposeAsync();

    [Fact]
    public async Task Seed_ReprendLesMorceauxReelsDeLaV1_DansLOrdreDeLaV1()
    {
        var admin = await SeededAdminAsync();

        var tracks = await ListAsync(admin);

        Assert.Equal(55, tracks.Count);
        Assert.Equal(CatalogueSeed.PlayableCount, tracks.Count(t => t.PreviewStatus == "available"));
        Assert.Equal(CatalogueSeed.WithoutPreviewCount, tracks.Count(t => t.PreviewStatus == "missing" && t.DeezerTrackId >= 9_000_000_000));
        Assert.DoesNotContain(tracks, t => t.Artist.StartsWith("Artiste ", StringComparison.Ordinal));
        var daftPunk = tracks.Single(t => t.DeezerTrackId == 66609426);
        Assert.Equal(("Daft Punk", "Get Lucky"), (daftPunk.Artist, daftPunk.Title));
        Assert.Equal("\"Heroes\"", tracks.Single(t => t.DeezerTrackId == 461043312).Title);
        Assert.Contains("bc49adb87758e0c8c4e508a9c5cce85d", daftPunk.CoverUrl);
        Assert.All(tracks, t => Assert.NotNull(t.ReleaseYear));
        Assert.All(tracks, t => Assert.NotNull(t.Rank));
        // Insérés dans l'ordre de la v1 : l'identifiant suit l'index du seed.
        Assert.Equal(CatalogueSeed.Tracks.Select(t => t.DeezerTrackId), tracks.OrderBy(t => t.Id).Select(t => t.DeezerTrackId));
    }

    [Fact]
    public async Task Usage_ReproduitCeluiDeLaV1()
    {
        var admin = await SeededAdminAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var tracks = await ListAsync(admin);

        var eminem = Of(tracks, "Eminem");
        Assert.Equal((today, 1, true), (eminem.LastUsedDate!.Value, eminem.UsageCount, eminem.InTodayChallenge));
        var daft = Of(tracks, "Daft Punk");
        Assert.Equal((today.AddDays(-2), 1, false), (daft.LastUsedDate!.Value, daft.UsageCount, daft.InTodayChallenge));
        Assert.Equal(today.AddDays(-1), Of(tracks, "Rihanna").LastUsedDate);
        var adele = Of(tracks, "Adele");
        Assert.Equal((7, today.AddDays(-90), today.AddDays(-60)), (adele.UsageCount, adele.LastUsedDate!.Value, adele.UnlockDate!.Value));
        var nirvana = tracks.Single(t => t.DeezerTrackId == 13791930);
        Assert.Equal((3, today), (nirvana.UsageCount, nirvana.UnlockDate!.Value));
        var michael = Of(tracks, "Michael Jackson");
        Assert.Equal((0, null, null, false), (michael.UsageCount, michael.LastUsedDate, michael.UnlockDate, michael.InTodayChallenge));
        Assert.Equal(today.AddDays(25), Of(tracks, "Queen").UnlockDate);
        Assert.Equal(5, tracks.Count(t => t.InTodayChallenge));
    }

    [Fact]
    public async Task Cooldown_ListeLesMorceauxDontLeDeblocageEstPosterieurAuJour()
    {
        var admin = await SeededAdminAsync();
        var tracks = await ListAsync(admin);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var usage = _host.Services.GetRequiredService<ITrackUsage>();
        var nirvana = tracks.Single(t => t.DeezerTrackId == 13791930).Id;

        var inCooldown = await usage.GetTracksInCooldownAsync(today, Ct);

        // Les 15 des défis, Queen (+25 j) et Ed Sheeran (+15 j) ; ni Nirvana (déblocage aujourd'hui), ni Adele, ni Michael Jackson.
        Assert.Equal(17, inCooldown.Count);
        Assert.Contains(Of(tracks, "Eminem").Id, inCooldown);
        Assert.Contains(Of(tracks, "Queen").Id, inCooldown);
        Assert.Contains(Of(tracks, "Ed Sheeran").Id, inCooldown);
        Assert.DoesNotContain(nirvana, inCooldown);
        Assert.DoesNotContain(Of(tracks, "Adele").Id, inCooldown);
        Assert.DoesNotContain(Of(tracks, "Michael Jackson").Id, inCooldown);
        Assert.DoesNotContain(Of(tracks, "Ed Sheeran").Id, await usage.GetTracksInCooldownAsync(today.AddDays(16), Ct));
    }

    [Fact]
    public async Task MorceauUtilise_NePeutPasEtreSupprime_NiDesactiveSiDuJour_MaisSeRenomme()
    {
        var admin = await SeededAdminAsync();
        var eminem = Of(await ListAsync(admin), "Eminem");

        var delete = await admin.DeleteAsync($"/api/admin/catalogue/tracks/{eminem.Id}", Ct);
        await AssertProblemAsync(delete, HttpStatusCode.Conflict, "catalogue.track_in_use");

        var disable = await admin.PutAsJsonAsync($"/api/admin/catalogue/tracks/{eminem.Id}/disabled", new SetTrackDisabled(true), Ct);
        await AssertProblemAsync(disable, HttpStatusCode.Conflict, "catalogue.track_in_today_challenge");

        var rename = await admin.PatchAsJsonAsync($"/api/admin/catalogue/tracks/{eminem.Id}", new RenameTrack("Eminem", "Lose Yourself (Remaster)"), Ct);
        Assert.Equal(HttpStatusCode.OK, rename.StatusCode);
        Assert.Equal("Lose Yourself (Remaster)", Of(await ListAsync(admin), "Eminem").Title);

        // Un morceau jamais utilisé se supprime.
        var michael = Of(await ListAsync(admin), "Michael Jackson");
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/catalogue/tracks/{michael.Id}", Ct)).StatusCode);
    }

    [Fact]
    public async Task Reset_VideLUsageSimule()
    {
        var admin = await SeededAdminAsync();
        var ids = (await ListAsync(admin)).Select(t => t.Id).ToList();
        var usage = _host.Services.GetRequiredService<E2eTrackUsage>();
        Assert.NotEmpty(await usage.GetAsync(ids, Ct));

        await admin.PostAsync("/api/e2e/reset", null, Ct);

        Assert.Empty(await usage.GetAsync(ids, Ct));
        Assert.Empty(await usage.GetTracksInCooldownAsync(DateOnly.MaxValue, Ct));
    }

    [Fact]
    public async Task Reseed_RemetToutAZero_PuisSeedeLePool_Idempotent()
    {
        var client = _host.CreateClient();
        await client.PostAsync("/api/e2e/seed-catalogue", null, Ct);
        await client.PostAsync("/api/players/guest", null, Ct);

        var first = await client.PostAsync("/api/e2e/reseed", null, Ct);
        var second = await client.PostAsync("/api/e2e/reseed", null, Ct);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(55, (await first.Content.ReadFromJsonAsync<SeedResponse>(Ct))!.Added);
        Assert.Equal(55, (await second.Content.ReadFromJsonAsync<SeedResponse>(Ct))!.Added);
        var tracks = await ListAsync(await LoggedAdminAsync());
        Assert.Equal(55, tracks.Count);
        Assert.Equal(5, tracks.Count(t => t.InTodayChallenge));
    }

    [Fact]
    public async Task LoginAsAdmin_ConnecteUnCompteAdmin_RejouableSansDoublon()
    {
        var client = _host.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/me", Ct)).StatusCode);

        var login = await client.PostAsync("/api/e2e/login-as-admin", null, Ct);

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/me", Ct)).StatusCode);
        var me = await client.GetFromJsonAsync<PlayerMeResponse>("/api/players/me", Ct);
        Assert.Equal((E2EEndpoints.AdminEmail, E2EEndpoints.AdminPseudo, false, true), (me!.Email, me.Pseudo, me.IsGuest, me.IsAdmin));

        // Une seconde connexion (autre navigateur) retrouve le même compte, toujours admin.
        var other = _host.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await other.PostAsync("/api/e2e/login-as-admin", null, Ct)).StatusCode);
        Assert.Equal(me.PlayerId, (await other.GetFromJsonAsync<PlayerMeResponse>("/api/players/me", Ct))!.PlayerId);
        Assert.Equal(HttpStatusCode.OK, (await other.GetAsync("/api/admin/me", Ct)).StatusCode);
    }

    [Fact]
    public async Task LoginAsAdmin_NavigateurDejaInvite_DevientAdmin()
    {
        var client = _host.CreateClient();
        await client.PostAsync("/api/players/guest", null, Ct);

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/e2e/login-as-admin", null, Ct)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/me", Ct)).StatusCode);
    }

    private async Task<HttpClient> LoggedAdminAsync()
    {
        var client = _host.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/e2e/login-as-admin", null, Ct)).StatusCode);
        return client;
    }

    private async Task<HttpClient> SeededAdminAsync()
    {
        var client = await LoggedAdminAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/e2e/reseed", null, Ct)).StatusCode);
        // Le reseed vide aussi les comptes : on se reconnecte.
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/e2e/login-as-admin", null, Ct)).StatusCode);
        return client;
    }

    private static async Task<List<TrackListItem>> ListAsync(HttpClient admin) =>
        (await admin.GetFromJsonAsync<List<TrackListItem>>("/api/admin/catalogue/tracks", Ct))!;

    private static TrackListItem Of(IEnumerable<TrackListItem> tracks, string artist) => tracks.First(t => t.Artist == artist);

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<Microsoft.AspNetCore.Mvc.ProblemDetails>(Ct);
        Assert.Equal(code, problem!.Extensions["code"]?.ToString());
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

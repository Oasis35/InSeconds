using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Testing.Deezer;
using Microsoft.Extensions.DependencyInjection;
using static InSeconds.IntegrationTests.Catalogue.CatalogueApi;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>
/// Revérifier un extrait manquant sans attendre la nuit : le bouton de l'admin (<c>POST /api/admin/catalogue/tracks/recheck-previews</c>) et la tâche
/// manuelle <c>catalogue-recheck-missing-previews</c>, plus la date « manquant depuis » que le contrôle de la nuit pose et efface.
/// </summary>
public class RecheckPreviewsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/api/admin/catalogue/tracks/recheck-previews";

    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    private Task MarkMissingAsync(int trackId, string since = "now() - interval '5 days'") =>
        _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET preview_status = 2, preview_missing_since = {since} WHERE id = {trackId}");

    private async Task<Dictionary<string, int>> RunJobAsync()
    {
        await using var scope = _app.Api.Services.CreateAsyncScope();
        return Assert.IsType<Dictionary<string, int>>(await scope.ServiceProvider.GetRequiredService<RecheckMissingPreviewsJob>().RunAsync(Ct));
    }

    private Task<bool> HasMissingSinceAsync(int trackId) =>
        _app.Api.ScalarAsync<bool>($"SELECT preview_missing_since IS NOT NULL FROM catalogue.tracks WHERE id = {trackId}");

    // ---------- Tâche manuelle ----------

    [Fact]
    public async Task Tache_UnExtraitRetrouve_RedevientDisponible_EtLaDateEstEffacee()
    {
        var track = await _app.AddAsync(1001);
        await MarkMissingAsync(track.Id);

        var report = await RunJobAsync();

        Assert.Equal(new Dictionary<string, int> { ["checked"] = 1, ["recovered"] = 1, ["stillMissing"] = 0, ["failed"] = 0 }, report);
        Assert.Equal(1, await _app.PreviewStatusOfAsync(track.Id));
        Assert.False(await HasMissingSinceAsync(track.Id));
    }

    [Fact]
    public async Task Tache_UnExtraitToujoursManquant_GardeSaDateDOrigine()
    {
        var track = await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);
        await MarkMissingAsync(track.Id, "'2026-10-01T00:00:00Z'");

        var report = await RunJobAsync();

        Assert.Equal(1, report["stillMissing"]);
        Assert.Equal(2, await _app.PreviewStatusOfAsync(track.Id));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM catalogue.tracks WHERE id = {track.Id} AND preview_missing_since = '2026-10-01T00:00:00Z'"));
    }

    [Fact]
    public async Task Tache_NeRegardeQueLesManquantsActifs()
    {
        var available = await _app.AddAsync(1001);
        var missing = await _app.AddAsync(1002);
        var disabledMissing = await _app.AddAsync(1003);
        await MarkMissingAsync(missing.Id);
        await MarkMissingAsync(disabledMissing.Id);
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET disabled_at = now() WHERE id = {disabledMissing.Id}");
        _app.Deezer.Reset();

        var report = await RunJobAsync();

        Assert.Equal(1, report["checked"]);
        Assert.Equal(["/track/1002"], _app.Deezer.Requests.Where(r => r.StartsWith("/track/")));
        Assert.Equal(1, await _app.PreviewStatusOfAsync(available.Id));
        Assert.Equal(2, await _app.PreviewStatusOfAsync(disabledMissing.Id));
    }

    [Fact]
    public async Task Tache_DeezerSansReponse_NeChangeRien_PiegeSeize()
    {
        var track = await _app.AddAsync(1001);
        await MarkMissingAsync(track.Id);
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(new HttpResponseMessage(HttpStatusCode.InternalServerError));

        var report = await RunJobAsync();

        Assert.Equal(new Dictionary<string, int> { ["checked"] = 1, ["recovered"] = 0, ["stillMissing"] = 0, ["failed"] = 1 }, report);
        Assert.Equal(2, await _app.PreviewStatusOfAsync(track.Id));
        Assert.True(await HasMissingSinceAsync(track.Id));
    }

    [Fact]
    public async Task Tache_PasDeManquant_RienAFaire()
    {
        await _app.AddAsync(1001);
        _app.Deezer.Reset();

        var report = await RunJobAsync();

        Assert.Equal(0, report["checked"]);
        Assert.DoesNotContain(_app.Deezer.Requests, r => r.StartsWith("/track/"));
    }

    // ---------- Bouton « Revérifier » ----------

    [Fact]
    public async Task Bouton_ReserveAUnAdmin()
    {
        var body = JsonContent.Create(new RecheckTrackPreviews([1]));
        Assert.Equal(HttpStatusCode.Unauthorized, (await _app.Api.CreateClient().PostAsync(Route, body, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _app.Api.CreateClient(TestUser.Player).PostAsync(Route, JsonContent.Create(new RecheckTrackPreviews([1])), Ct)).StatusCode);
    }

    [Fact]
    public async Task Bouton_RenvoieLEtatMisAJour_UnParMorceau()
    {
        var recovered = await _app.AddAsync(1001);
        var still = await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);
        await MarkMissingAsync(recovered.Id);
        await MarkMissingAsync(still.Id);

        var response = await _app.Admin().PostAsJsonAsync(Route, new RecheckTrackPreviews([recovered.Id, still.Id]), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var tracks = (await response.Content.ReadFromJsonAsync<RecheckTrackPreviewsResponse>(Ct))!.Tracks.ToDictionary(t => t.Id);
        Assert.Equal(("available", null, true), (tracks[recovered.Id].PreviewStatus, tracks[recovered.Id].PreviewMissingSince, tracks[recovered.Id].Answered));
        Assert.Equal(("missing", true, true), (tracks[still.Id].PreviewStatus, tracks[still.Id].PreviewMissingSince is not null, tracks[still.Id].Answered));
        Assert.Equal(1, await _app.PreviewStatusOfAsync(recovered.Id));
    }

    [Fact]
    public async Task Bouton_DeezerSansReponse_GardeLEtat_EtLeDit()
    {
        var track = await _app.AddAsync(1001);
        await MarkMissingAsync(track.Id);
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(
            new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { error = new { type = "Exception", message = "Quota", code = 4 } }) });

        var response = await _app.Admin().PostAsJsonAsync(Route, new RecheckTrackPreviews([track.Id]), Ct);

        var item = Assert.Single((await response.Content.ReadFromJsonAsync<RecheckTrackPreviewsResponse>(Ct))!.Tracks);
        Assert.False(item.Answered);
        Assert.Equal("missing", item.PreviewStatus);
        Assert.Equal(2, await _app.PreviewStatusOfAsync(track.Id));
    }

    [Fact]
    public async Task Bouton_RecontroleAussiUnMorceauDesactive_QueLAdminDemande()
    {
        var track = await _app.AddAsync(1001);
        await MarkMissingAsync(track.Id);
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET disabled_at = now() WHERE id = {track.Id}");

        await _app.Admin().PostAsJsonAsync(Route, new RecheckTrackPreviews([track.Id]), Ct);

        Assert.Equal(1, await _app.PreviewStatusOfAsync(track.Id));
    }

    [Fact]
    public async Task Bouton_AucunMorceauConnu_404_EtUneListeVideOuTropLongue_400()
    {
        await CatalogueApi.AssertProblemAsync(
            await _app.Admin().PostAsJsonAsync(Route, new RecheckTrackPreviews([987654]), Ct), HttpStatusCode.NotFound, "common.not_found");
        Assert.Equal(HttpStatusCode.BadRequest, (await _app.Admin().PostAsJsonAsync(Route, new RecheckTrackPreviews([]), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await _app.Admin().PostAsJsonAsync(Route, new RecheckTrackPreviews([.. Enumerable.Range(1, RecheckTrackPreviewsValidator.MaxTracks + 1)]), Ct)).StatusCode);
    }

    // ---------- « Manquant depuis » ----------

    [Fact]
    public async Task ListeDuPool_DonneLaDateManquantDepuis()
    {
        var track = await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);

        var item = Assert.Single(await _app.ListAsync());

        Assert.Equal(track.Id, item.Id);
        Assert.Equal("missing", item.PreviewStatus);
        Assert.Equal(Start, item.PreviewMissingSince);
    }

    [Fact]
    public async Task ControleDeLaNuit_PoseLaDatePourUnManquantSansDate_PuisLaGarde_EtLEfface()
    {
        var track = await _app.AddAsync(1001);
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET preview_status = 2, preview_missing_since = NULL WHERE id = {track.Id}");
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"id":1001,"title":"T","preview":"","artist":{"name":"A"}}""", System.Text.Encoding.UTF8, "application/json") });

        await RefreshAsync();
        Assert.Equal(Start, (await _app.ListAsync()).Single().PreviewMissingSince);

        _app.Time.Advance(TimeSpan.FromDays(3));
        await RefreshAsync();
        Assert.Equal(Start, (await _app.ListAsync()).Single().PreviewMissingSince);

        _app.Deezer.Intercept = null;
        await RefreshAsync();
        Assert.Null((await _app.ListAsync()).Single().PreviewMissingSince);
        Assert.Equal(1, await _app.PreviewStatusOfAsync(track.Id));
    }

    private async Task RefreshAsync()
    {
        await using var scope = _app.Api.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<RefreshPreviewsJob>().RunAsync(Ct);
    }
}

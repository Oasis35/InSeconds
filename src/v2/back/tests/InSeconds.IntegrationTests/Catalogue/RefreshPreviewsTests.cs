using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Testing.Deezer;
using Microsoft.Extensions.DependencyInjection;
using static InSeconds.IntegrationTests.Catalogue.CatalogueApi;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>
/// La tâche <c>catalogue-refresh</c>, appelée directement (§ 5.4 bis du plan v2) : elle recontrôle l'extrait et le
/// rang des morceaux que le défi de demain pourrait tirer. Mêmes scénarios que la v1 (<c>RefreshPreviewsTests</c>),
/// plus l'état « inconnu » du piège 16 : un Deezer qui ne répond pas ne change jamais l'état d'un morceau.
/// </summary>
public class RefreshPreviewsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task PoolCoherent_CompteursSansModification()
    {
        await _app.AddAsync(1001);
        await _app.AddAsync(1002);
        await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(3, 0, 0), result);
    }

    [Fact]
    public async Task FlagCorrompu_EstRepare()
    {
        // Le bug prod du 06/07 : un morceau valide (extrait disponible chez Deezer) marqué à tort « sans preview ».
        var track = await _app.AddAsync(1001);
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET preview_status = 2 WHERE id = {track.Id}");

        var result = await RunAsync();

        Assert.Equal(1, result.Updated);
        Assert.Equal(1, await _app.PreviewStatusOfAsync(track.Id));
    }

    [Fact]
    public async Task ExtraitDisparuChezDeezer_MarqueAbsent()
    {
        var track = await _app.AddAsync(1001);
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(
            JsonOk("""{"id":1001,"title":"T","preview":"","artist":{"name":"A"}}"""));

        var result = await RunAsync();

        Assert.Equal(1, result.Updated);
        Assert.Equal(2, await _app.PreviewStatusOfAsync(track.Id));
    }

    [Fact]
    public async Task MorceauSupprimeChezDeezer_800_MarqueAbsent()
    {
        var track = await _app.AddAsync(1001);
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(
            JsonOk("""{"error":{"type":"DataException","message":"no data","code":800}}"""));

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(1, 1, 0), result);
        Assert.Equal(2, await _app.PreviewStatusOfAsync(track.Id));
    }

    [Theory]
    [InlineData("""{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""")]
    [InlineData("""{"error":{"type":"Exception","message":"Service busy","code":700}}""")]
    public async Task ErreurDeezerEnHttp200_NeModifieRien_ComptePourEchec_Piege16(string payload)
    {
        // Le bug prod du 06/07 : un quota renvoyé en 200 marquait ~200 morceaux valides « sans preview ».
        var available = await _app.AddAsync(1001);
        var missing = await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(JsonOk(payload));

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(2, 0, 2), result);
        Assert.Equal(1, await _app.PreviewStatusOfAsync(available.Id));
        Assert.Equal(2, await _app.PreviewStatusOfAsync(missing.Id));
    }

    [Fact]
    public async Task PanneHttp_NeModifieRien_ComptePourEchec()
    {
        var track = await _app.AddAsync(1001);
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(new HttpResponseMessage(System.Net.HttpStatusCode.InternalServerError));

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(1, 0, 1), result);
        Assert.Equal(1, await _app.PreviewStatusOfAsync(track.Id));
    }

    [Fact]
    public async Task MorceauDesactive_NEstPasVerifie()
    {
        var track = await _app.AddAsync(1001);
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET preview_status = 2, disabled_at = now() WHERE id = {track.Id}");
        _app.Deezer.Reset();

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(0, 0, 0), result);
        Assert.Empty(_app.Deezer.Requests);
        Assert.Equal(2, await _app.PreviewStatusOfAsync(track.Id));
    }

    [Fact]
    public async Task MorceauEnCooldownDeDemain_NEstPasVerifie_LeJourDemandeEstDemain()
    {
        var checkedTrack = await _app.AddAsync(1001);
        var cooling = await _app.AddAsync(1002);
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET preview_status = 2 WHERE id IN ({checkedTrack.Id}, {cooling.Id})");
        _app.Usage.Cooldown.Add(cooling.Id);
        _app.Deezer.Reset();

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(1, 1, 0), result);
        // La tâche tourne à 23 h, la veille de la génération : ce sont les morceaux tirables demain.
        Assert.Equal([new DateOnly(2026, 10, 6)], _app.Usage.AskedDays);
        Assert.Equal(["/track/1001"], _app.Deezer.Requests);
        Assert.Equal(1, await _app.PreviewStatusOfAsync(checkedTrack.Id));
        Assert.Equal(2, await _app.PreviewStatusOfAsync(cooling.Id));
    }

    [Fact]
    public async Task MorceauSupprimePendantLeControle_LesAutresSontMisAJour_LaTacheReussit()
    {
        // Lots d'un morceau : le morceau C est supprimé par l'admin pendant que B est contrôlé. Les résultats déjà
        // obtenus restent enregistrés (A, B), C est ignoré, la tâche ne lève rien.
        await using var app = CatalogueApi.Create(await postgres.CreateDatabaseAsync(), new Dictionary<string, string> { ["Catalogue:Refresh:BatchSize"] = "1" });
        _ = app.Api.Server;
        var a = await app.AddAsync(1001);
        var b = await app.AddAsync(1002);
        var c = await app.AddAsync(1003);
        await app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET preview_status = 2 WHERE id IN ({a.Id}, {b.Id}, {c.Id})");
        app.Deezer.Intercept = async (request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/track/1002")
                await app.Api.ExecuteAsync($"DELETE FROM catalogue.tracks WHERE id = {c.Id}");
            return null;
        };

        await using var scope = app.Api.Services.CreateAsyncScope();
        var report = Assert.IsType<Dictionary<string, int>>(await scope.ServiceProvider.GetRequiredService<RefreshPreviewsJob>().RunAsync(Ct));

        Assert.Equal(3, report["checked"]);
        Assert.Equal(2, report["updated"]);
        Assert.Equal(0, report["failed"]);
        Assert.Equal(1, await app.PreviewStatusOfAsync(a.Id));
        Assert.Equal(1, await app.PreviewStatusOfAsync(b.Id));
        Assert.Equal(0L, await app.Api.ScalarAsync<long>($"SELECT count(*) FROM catalogue.tracks WHERE id = {c.Id}"));
    }

    [Fact]
    public async Task LeRangEstMisAJour_AvecSaDate()
    {
        var track = await _app.AddAsync(1001);
        await _app.Api.ExecuteAsync($"UPDATE catalogue.tracks SET deezer_rank = 1, rank_updated_at = NULL WHERE id = {track.Id}");

        await RunAsync();

        Assert.Equal(1L, await _app.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM catalogue.tracks WHERE id = {track.Id} AND deezer_rank = {500_000 + 1001 % 1000} AND rank_updated_at = '{CatalogueApi.Start:O}'"));
    }

    [Fact]
    public async Task PlusDeDixMorceaux_TousVerifies_PlusieursLots()
    {
        for (var i = 0; i < 23; i++)
            await _app.AddAsync(2000 + i);
        _app.Deezer.Reset();

        var result = await RunAsync();

        Assert.Equal(new PreviewRefreshResult(23, 0, 0), result);
        Assert.Equal(23, _app.Deezer.Requests.Count);
    }

    [Fact]
    public async Task LaTacheEstDeclareeSousSonIdentifiant_EtSonCronParDefaut()
    {
        await using var scope = _app.Api.Services.CreateAsyncScope();

        Assert.Equal("catalogue-refresh", RefreshPreviewsJob.Id);
        Assert.Equal("0 23 * * *", RefreshPreviewsJob.DefaultCron);
        Assert.NotNull(scope.ServiceProvider.GetService<RefreshPreviewsJob>());
    }

    private async Task<PreviewRefreshResult> RunAsync()
    {
        await using var scope = _app.Api.Services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<RefreshPreviewsJob>().RunAsync(Ct);
        var report = Assert.IsType<Dictionary<string, int>>(result);
        return new PreviewRefreshResult(report["checked"], report["updated"], report["failed"]);
    }

    private static HttpResponseMessage JsonOk(string body) =>
        new(System.Net.HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };
}

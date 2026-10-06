using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Testing.Deezer;
using InSeconds.IntegrationTests.Jobs;
using static InSeconds.IntegrationTests.Catalogue.CatalogueApi;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>
/// Le bouton « Re-vérifier les previews » (§ 5.4 bis du plan v2) : <c>POST /api/admin/catalogue/refresh-previews</c>
/// déclenche la tâche Hangfire <c>catalogue-refresh</c> et répond 202 avec l'exécution à suivre par
/// <c>GET /api/admin/jobs/{id}</c>. Un vrai serveur Hangfire tourne ici (d'où <see cref="HangfireServerCollection"/>).
/// </summary>
[Collection(nameof(HangfireServerCollection))]
public class RefreshPreviewsTriggerTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/api/admin/catalogue/refresh-previews";

    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync(), new Dictionary<string, string> { ["Jobs:Server:Enabled"] = "true" });
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task Bouton_202AvecLExecutionASuivre_PuisCompteRenduDeLaTache()
    {
        await _app.AddAsync(1001);
        await _app.AddAsync(FakeDeezerHandler.NoPreviewFrom + 1);
        await _app.Api.ExecuteAsync("UPDATE catalogue.tracks SET preview_status = 2 WHERE deezer_track_id = 1001");

        var response = await _app.Admin().PostAsync(Route, null, Ct);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var execution = (await response.Content.ReadFromJsonAsync<JobExecutionResponse>(Ct))!;
        Assert.Equal($"/api/admin/jobs/{execution.Id}", response.Headers.Location!.OriginalString);

        var status = await WaitUntilAsync(execution.Id, "succeeded");

        Assert.Equal(2, status.Result!.Value.GetProperty("checked").GetInt32());
        Assert.Equal(1, status.Result.Value.GetProperty("updated").GetInt32());
        Assert.Equal(0, status.Result.Value.GetProperty("failed").GetInt32());
        Assert.Equal(1, await _app.PreviewStatusOfAsync((await _app.ListAsync()).Single(t => t.DeezerTrackId == 1001).Id));
    }

    [Fact]
    public async Task SecondClicPendantUneExecution_SuitCelleEnCours_NeEnLanceAucuneAutre()
    {
        await _app.AddAsync(1001);
        var gate = new TaskCompletionSource();
        _app.Deezer.Intercept = async (_, ct) =>
        {
            await gate.Task.WaitAsync(ct);
            return null;
        };

        var first = await TriggerAsync();
        await WaitUntilRequestedAsync();
        var second = await TriggerAsync();

        Assert.Equal(first.Id, second.Id);

        gate.SetResult();
        await WaitUntilAsync(first.Id, "succeeded");

        // Terminée : un nouveau clic lance une nouvelle exécution.
        var third = await TriggerAsync();
        Assert.NotEqual(first.Id, third.Id);
        await WaitUntilAsync(third.Id, "succeeded");
    }

    [Fact]
    public async Task EchecDeDeezer_EstDansLeCompteRendu_PasUneErreurDeLaTache()
    {
        await _app.AddAsync(1001);
        _app.Deezer.Intercept = (_, _) => Task.FromResult<HttpResponseMessage?>(new HttpResponseMessage(HttpStatusCode.InternalServerError));

        var status = await WaitUntilAsync((await TriggerAsync()).Id, "succeeded");

        Assert.Equal(1, status.Result!.Value.GetProperty("failed").GetInt32());
        Assert.Equal(0, status.Result.Value.GetProperty("updated").GetInt32());
    }

    private async Task<JobExecutionResponse> TriggerAsync()
    {
        var response = await _app.Admin().PostAsync(Route, null, Ct);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JobExecutionResponse>(Ct))!;
    }

    private async Task WaitUntilRequestedAsync()
    {
        for (var waited = 0; _app.Deezer.Requests.Count == 0; waited += 100)
        {
            Assert.True(waited < 30_000, "La tâche n'a jamais interrogé Deezer.");
            await Task.Delay(100, Ct);
        }
    }

    private async Task<JobStatusResponse> WaitUntilAsync(string id, string state)
    {
        var client = _app.Admin();
        JobStatusResponse? status = null;
        for (var waited = 0; waited < 30_000; waited += 200)
        {
            status = await client.GetFromJsonAsync<JobStatusResponse>($"/api/admin/jobs/{id}", Ct);
            if (status!.State == state)
                return status;
            await Task.Delay(200, Ct);
        }

        Assert.Fail($"L'exécution {id} n'a pas atteint l'état {state} : {status?.State} ({status?.ErrorCode}).");
        return status!;
    }
}

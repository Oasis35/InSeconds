using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.IntegrationTests.Jobs;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Le bouton « Générer le défi du jour » (§ 5.4 bis du plan v2) : <c>POST /api/admin/daily/challenges/generate-today</c>
/// déclenche la tâche Hangfire et répond 202 avec l'exécution à suivre par <c>GET /api/admin/jobs/{id}</c>. Un vrai serveur
/// Hangfire tourne ici (d'où <see cref="HangfireServerCollection"/>).
/// </summary>
[Collection(nameof(HangfireServerCollection))]
public class GenerateTodayButtonTests(GenerateTodayButtonTests.AppFixture fixture) : IClassFixture<GenerateTodayButtonTests.AppFixture>, IAsyncLifetime
{
    private const string Route = "/api/admin/daily/challenges/generate-today";

    private DailyApi _app = null!;

    /// <summary>
    /// **Une seule API pour toute la classe**, base remise à zéro avant chaque test. Hangfire garde en cache, pour tout le
    /// processus, les attributs d'une tâche (dont `[AutomaticRetry]`, qui journalise) : lié au journal de la première API de test,
    /// il échoue une fois celle-ci détruite, et l'exécution reste « en cours » au lieu d'échouer. En prod, une seule API par processus.
    /// </summary>
    public sealed class AppFixture(PostgresFixture postgres) : IAsyncLifetime
    {
        public DailyApi App { get; private set; } = null!;

        public async ValueTask InitializeAsync()
        {
            App = DailyApi.Create(await postgres.CreateDatabaseAsync(), new Dictionary<string, string> { ["Jobs:Server:Enabled"] = "true" });
            _ = App.Api.Server;
        }

        public ValueTask DisposeAsync() => App.DisposeAsync();
    }

    public async ValueTask InitializeAsync()
    {
        _app = fixture.App;
        await _app.Api.ExecuteAsync("TRUNCATE daily.challenge_day_stats, daily.answers, daily.sessions, daily.challenge_tracks, daily.challenges, catalogue.tracks");
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Bouton_202AvecLExecutionASuivre_PuisCompteRendu_DefiMarqueAdmin()
    {
        await _app.AddPlayableTracksAsync(40);

        var response = await _app.Admin().PostAsync(Route, null, Ct);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var execution = (await response.Content.ReadFromJsonAsync<JobExecutionResponse>(Ct))!;
        Assert.Equal($"/api/admin/jobs/{execution.Id}", response.Headers.Location!.OriginalString);

        var status = await WaitUntilAsync(execution.Id, "succeeded");

        var report = status.Result!.Value;
        Assert.True(report.GetProperty("created").GetBoolean());
        Assert.Equal("2026-10-05", report.GetProperty("date").GetString());
        Assert.Equal(5, report.GetProperty("tracks").GetInt32());
        Assert.Equal(await _app.Api.ScalarAsync<int>("SELECT id FROM daily.challenges"), report.GetProperty("challengeId").GetInt32());
        Assert.Equal((short)ChallengeOrigin.Admin, await _app.OriginOfAsync(Today));
    }

    [Fact]
    public async Task DefiDejaGenere_LeCompteRenduDitQuIlExistait_PasUneErreur()
    {
        await _app.AddPlayableTracksAsync(40);
        await _app.GenerateAsync();

        var status = await WaitUntilAsync(await TriggerAsync(), "succeeded");

        Assert.False(status.Result!.Value.GetProperty("created").GetBoolean());
        Assert.Equal(1, await _app.ChallengeCountAsync());
        Assert.Equal((short)ChallengeOrigin.Nightly, await _app.OriginOfAsync(Today));
    }

    [Fact]
    public async Task PoolInsuffisant_ExecutionEnEchec_CodeAdminPoolInsufficient_SansReessai()
    {
        await _app.AddPlayableTracksAsync(3);

        var status = await WaitUntilAsync(await TriggerAsync(), "failed");

        Assert.Equal("admin.pool_insufficient", status.ErrorCode);
        Assert.Equal(0, await _app.ChallengeCountAsync());
    }

    [Fact]
    public async Task ApresUnEchec_UnNouveauClicRelanceUneExecution()
    {
        await _app.AddPlayableTracksAsync(3);
        var failed = await TriggerAsync();
        await WaitUntilAsync(failed, "failed");

        await _app.AddPlayableTracksAsync(40, firstId: 4);
        var retry = await TriggerAsync();

        Assert.NotEqual(failed, retry);
        await WaitUntilAsync(retry, "succeeded");
        Assert.Equal(1, await _app.ChallengeCountAsync());
    }

    [Fact]
    public async Task LaRouteExigeUnAdmin()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _app.Api.CreateClient().PostAsync(Route, null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _app.Api.CreateClient(TestUser.Player).PostAsync(Route, null, Ct)).StatusCode);
    }

    private async Task<string> TriggerAsync()
    {
        var response = await _app.Admin().PostAsync(Route, null, Ct);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JobExecutionResponse>(Ct))!.Id;
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

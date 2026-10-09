using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Hangfire;
using Hangfire.Storage;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Jobs;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Jobs;

/// <summary>
/// <c>GET /api/admin/jobs/last-runs</c> : le dernier passage de chaque tâche, affiché en témoin dans l'onglet Actions (§ 5.4 bis).
/// Le serveur Hangfire tourne ici, pour de vraies exécutions (d'où <see cref="HangfireServerCollection"/>). Les tâches sont
/// lancées comme depuis <c>/jobs</c> (« Déclencher maintenant »).
/// </summary>
[Collection(nameof(HangfireServerCollection))]
public class JobLastRunsTests(JobLastRunsTests.AppFixture fixture) : IClassFixture<JobLastRunsTests.AppFixture>
{
    private const string Route = "/api/admin/jobs/last-runs";

    /// <summary>
    /// **Une seule API pour toute la classe** : Hangfire garde en cache, pour tout le processus, les attributs d'une tâche (dont
    /// <c>[AutomaticRetry]</c>, qui journalise) ; liés au journal d'une API de test détruite, ils feraient échouer la tâche autrement
    /// qu'attendu. Chaque test lance sa propre tâche.
    /// </summary>
    public sealed class AppFixture(PostgresFixture postgres) : IAsyncLifetime
    {
        public ApiFactory Api { get; private set; } = null!;

        public async ValueTask InitializeAsync()
        {
            Api = new ApiFactory(await postgres.CreateDatabaseAsync(),
                services => services
                    .AddScheduledJob<SucceedingJob>("test-succeeding", Cron.Never())
                    .AddScheduledJob<SucceedingJob>("test-retention", Cron.Never())
                    .AddScheduledJob<FailingJob>("test-failing", Cron.Never())
                    .AddScheduledJob<CrashingJob>("test-crashing", Cron.Never())
                    .AddScheduledJob<RetryingJob>("test-retrying", Cron.Never())
                    .AddScheduledJob<SucceedingJob>("test-nightly", "0 4 * * *"),
                settings: new Dictionary<string, string> { ["Jobs:Server:Enabled"] = "true" });
            _ = Api.Server;
        }

        public ValueTask DisposeAsync() => Api.DisposeAsync();
    }

    private ApiFactory Api => fixture.Api;

    [Fact]
    public async Task Anonyme_401_JoueurNonAdmin_403()
    {
        var anonymous = await Api.CreateClient().GetAsync(Route, Ct);
        var player = await Api.CreateClient(TestUser.Player).GetAsync(Route, Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.Equal(ErrorCodes.Unauthorized, await ReadCodeAsync(anonymous));
        Assert.Equal(HttpStatusCode.Forbidden, player.StatusCode);
        Assert.Equal(ErrorCodes.Forbidden, await ReadCodeAsync(player));
    }

    [Fact]
    public async Task ToutesLesTachesDeclarees_AvecLeurProchainPassage_RienSiJamaisLancees()
    {
        var runs = await GetAsync();

        Assert.Contains(runs, run => run.Id == "daily-generate-challenge");
        Assert.Contains(runs, run => run.Id == "catalogue-refresh");
        var nightly = Assert.Single(runs, run => run.Id == "test-nightly");
        Assert.Null(nightly.State);
        Assert.Null(nightly.At);
        Assert.NotNull(nightly.NextRunAt);
        Assert.Equal(TimeSpan.Zero, nightly.NextRunAt!.Value.Offset);
        Assert.Equal(4, nightly.NextRunAt.Value.Hour);
        // Une tâche en pause n'a pas de prochain passage.
        Assert.Null(runs.Single(run => run.Id == "test-failing").NextRunAt);
    }

    [Fact]
    public async Task PassageReussi_DateEtCompteRendu()
    {
        var before = DateTimeOffset.UtcNow.AddSeconds(-5);
        Trigger("test-succeeding");

        var run = await WaitUntilAsync("test-succeeding", "succeeded");

        Assert.Null(run.ErrorCode);
        Assert.Null(run.RetryAt);
        Assert.InRange(run.At!.Value, before, DateTimeOffset.UtcNow.AddSeconds(5));
        Assert.Equal(3, run.Result!.Value.GetProperty("Checked").GetInt32());
        Assert.Equal(1, run.Result.Value.GetProperty("Updated").GetInt32());
    }

    [Fact]
    public async Task PassageReussi_GardeSeptJours()
    {
        Trigger("test-retention");
        await WaitUntilAsync("test-retention", "succeeded");

        string jobId;
        using (var connection = Api.Services.GetRequiredService<JobStorage>().GetConnection())
            jobId = connection.GetRecurringJobs().Single(job => job.Id == "test-retention").LastJobId!;
        var expireAt = await Api.ScalarAsync<DateTime>($"SELECT expireat FROM jobs.job WHERE id = {long.Parse(jobId)}");

        var retention = new DateTimeOffset(DateTime.SpecifyKind(expireAt, DateTimeKind.Utc)) - DateTimeOffset.UtcNow;
        Assert.InRange(retention, JobsSetup.ExecutionRetention - TimeSpan.FromMinutes(5), JobsSetup.ExecutionRetention);
    }

    [Fact]
    public async Task EchecMetier_SonCode_SansCompteRendu()
    {
        Trigger("test-failing");

        var run = await WaitUntilAsync("test-failing", "failed");

        Assert.Equal(FailingJob.Code, run.ErrorCode);
        Assert.Null(run.Result);
        Assert.NotNull(run.At);
    }

    [Fact]
    public async Task ExceptionImprevue_CodeGeneriqueSansDetail()
    {
        Trigger("test-crashing");

        var body = await WaitUntilRawAsync("test-crashing", "failed");

        Assert.Contains(ErrorCodes.Unexpected, body);
        Assert.DoesNotContain(CrashingJob.SecretDetail, body);
        Assert.DoesNotContain(nameof(InvalidOperationException), body);
    }

    [Fact]
    public async Task EchecAvecReessai_CodeDeLErreur_EtHeureDuProchainEssai()
    {
        Trigger("test-retrying");

        var run = await WaitUntilAsync("test-retrying", "retry_scheduled");

        Assert.Equal(FailingJob.Code, run.ErrorCode);
        // RetryingJob réessaie après une heure : l'heure du prochain essai suit celle de l'échec.
        Assert.InRange(run.RetryAt!.Value - run.At!.Value, TimeSpan.FromMinutes(59), TimeSpan.FromMinutes(61));
    }

    private void Trigger(string id) => Api.Services.GetRequiredService<IRecurringJobManagerV2>().TriggerJob(id);

    private async Task<JobLastRun[]> GetAsync() =>
        (await Api.CreateClient(TestUser.Admin).GetFromJsonAsync<JobLastRun[]>(Route, Ct))!;

    private async Task<JobLastRun> WaitUntilAsync(string id, string state)
    {
        await WaitUntilRawAsync(id, state);
        return (await GetAsync()).Single(run => run.Id == id);
    }

    /// <summary>Attend l'état voulu ; rend le JSON brut de la tâche (pour vérifier ce qui n'y est pas).</summary>
    private async Task<string> WaitUntilRawAsync(string id, string state)
    {
        var client = Api.CreateClient(TestUser.Admin);
        string body = "";
        for (var waited = 0; waited < 30_000; waited += 200)
        {
            var runs = await client.GetFromJsonAsync<JsonElement>(Route, Ct);
            var run = runs.EnumerateArray().Single(r => r.GetProperty("id").GetString() == id);
            body = run.GetRawText();
            if (run.TryGetProperty("state", out var current) && current.ValueKind == JsonValueKind.String
                && current.GetString() == state)
                return body;
            await Task.Delay(200, Ct);
        }

        Assert.Fail($"La tâche {id} n'a pas atteint l'état {state} : {body}");
        return body;
    }

    private static async Task<string?> ReadCodeAsync(HttpResponseMessage response)
    {
        var problem = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>(Ct);
        return problem!["code"].ToString();
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

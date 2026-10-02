using System.Net;
using System.Net.Http.Json;
using Hangfire;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Jobs;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Jobs;

/// <summary>
/// <c>GET /api/admin/jobs/{id}</c> : l'admin suit une exécution lancée par un bouton (§ 5.4 bis).
/// Le serveur Hangfire tourne ici, pour de vraies exécutions (d'où <see cref="HangfireServerCollection"/>).
/// </summary>
[Collection(nameof(HangfireServerCollection))]
public class JobStatusTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync() =>
        _api = new ApiFactory(await postgres.CreateDatabaseAsync(),
            settings: new Dictionary<string, string> { ["Jobs:Server:Enabled"] = "true" });

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task Anonyme_401_AuFormatProblemDetails()
    {
        var response = await _api.CreateClient().GetAsync("/api/admin/jobs/1", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(ErrorCodes.Unauthorized, await ReadCodeAsync(response));
    }

    [Fact]
    public async Task JoueurNonAdmin_403()
    {
        var response = await _api.CreateClient(TestUser.Player).GetAsync("/api/admin/jobs/1", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(ErrorCodes.Forbidden, await ReadCodeAsync(response));
    }

    [Theory]
    [InlineData("999999")]
    [InlineData("pas-un-nombre")]
    public async Task ExecutionInconnue_404(string id)
    {
        var response = await _api.CreateClient(TestUser.Admin).GetAsync($"/api/admin/jobs/{id}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(ErrorCodes.NotFound, await ReadCodeAsync(response));
    }

    [Fact]
    public async Task ExecutionReussie_RenvoieLeCompteRendu()
    {
        var id = Enqueue<SucceedingJob>();

        var status = await WaitUntilAsync(id, "succeeded");

        Assert.Null(status.ErrorCode);
        Assert.Equal(3, status.Result!.Value.GetProperty("Checked").GetInt32());
        Assert.Equal(1, status.Result.Value.GetProperty("Updated").GetInt32());
    }

    [Fact]
    public async Task EchecMetier_RenvoieSonCode()
    {
        var id = Enqueue<FailingJob>();

        var status = await WaitUntilAsync(id, "failed");

        Assert.Equal(FailingJob.Code, status.ErrorCode);
        Assert.Null(status.Result);
    }

    [Fact]
    public async Task ExceptionImprevue_CodeGeneriqueSansDetail()
    {
        var id = Enqueue<CrashingJob>();

        var body = await WaitUntilRawAsync(id, "failed");

        Assert.Contains(ErrorCodes.Unexpected, body);
        Assert.DoesNotContain(CrashingJob.SecretDetail, body);
        Assert.DoesNotContain(nameof(InvalidOperationException), body);
    }

    [Fact]
    public async Task EchecAvecReessai_RetryScheduledEtCodeDeLErreur()
    {
        var id = Enqueue<RetryingJob>();

        var status = await WaitUntilAsync(id, "retry_scheduled");

        Assert.Equal(FailingJob.Code, status.ErrorCode);
    }

    private string Enqueue<TJob>() where TJob : IScheduledJob =>
        _api.Services.GetRequiredService<IBackgroundJobClient>().Enqueue<TJob>(job => job.RunAsync(CancellationToken.None));

    private async Task<JobStatusResponse> WaitUntilAsync(string id, string state)
    {
        await WaitUntilRawAsync(id, state);
        var client = _api.CreateClient(TestUser.Admin);
        return (await client.GetFromJsonAsync<JobStatusResponse>($"/api/admin/jobs/{id}", TestContext.Current.CancellationToken))!;
    }

    private async Task<string> WaitUntilRawAsync(string id, string state)
    {
        var client = _api.CreateClient(TestUser.Admin);
        var deadline = TimeSpan.FromSeconds(30);
        var waited = TimeSpan.Zero;
        string body;
        do
        {
            var response = await client.GetAsync($"/api/admin/jobs/{id}", TestContext.Current.CancellationToken);
            response.EnsureSuccessStatusCode();
            body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
            if (body.Contains($"\"state\":\"{state}\"", StringComparison.Ordinal))
                return body;
            await Task.Delay(200, TestContext.Current.CancellationToken);
            waited += TimeSpan.FromMilliseconds(200);
        }
        while (waited < deadline);

        Assert.Fail($"L'exécution {id} n'a pas atteint l'état {state} : {body}");
        return body;
    }

    private static async Task<string?> ReadCodeAsync(HttpResponseMessage response)
    {
        var problem = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>(TestContext.Current.CancellationToken);
        return problem!["code"].ToString();
    }
}

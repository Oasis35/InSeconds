using System.Net;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.UnitTests.Support;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace InSeconds.UnitTests.Infrastructure.Jobs;

/// <summary>Le signal envoyé à healthchecks.io après chaque tâche récurrente (#315).</summary>
public class JobHeartbeatTests
{
    private const string Key = "cle-secrete";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Reussite_PingDeLaTache_CreeSiAbsent()
    {
        var handler = Ok();

        await Create(handler).SignalAsync("daily-generate-challenge", succeeded: true, Ct);

        Assert.Equal(HttpMethod.Post, handler.LastRequest!.Method);
        Assert.Equal($"https://hc-ping.com/{Key}/daily-generate-challenge?create=1", handler.LastRequest.RequestUri!.ToString());
    }

    [Fact]
    public async Task Echec_PingFail()
    {
        var handler = Ok();

        await Create(handler).SignalAsync("catalogue-refresh", succeeded: false, Ct);

        Assert.Equal($"https://hc-ping.com/{Key}/catalogue-refresh/fail?create=1", handler.LastRequest!.RequestUri!.ToString());
    }

    [Fact]
    public async Task AutreAdresse_SansBarreFinaleEnDouble()
    {
        var handler = Ok();

        await Create(handler, baseUrl: "http://healthchecks.test/").SignalAsync("players-purge", succeeded: true, Ct);

        Assert.Equal($"http://healthchecks.test/{Key}/players-purge?create=1", handler.LastRequest!.RequestUri!.ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public async Task SansCle_RienNEstEnvoye(string? key)
    {
        var handler = Ok();

        await Create(handler, key: key).SignalAsync("daily-generate-challenge", succeeded: true, Ct);

        Assert.Null(handler.LastRequest);
    }

    [Fact]
    public async Task RefusDuServeur_AvertissementSansLaCle()
    {
        var logger = new CapturingLogger<JobHeartbeat>();

        await Create(new StubHttpHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound))), logger: logger)
            .SignalAsync("daily-generate-challenge", succeeded: true, Ct);

        var log = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Warning, log.Level);
        Assert.Contains("404", log.Message);
        Assert.DoesNotContain(Key, log.Message);
    }

    [Fact]
    public async Task ServeurInjoignable_NeLevePas_AvertissementSansLaCle()
    {
        var logger = new CapturingLogger<JobHeartbeat>();
        var handler = new StubHttpHandler((request, _) =>
            throw new HttpRequestException($"Connexion impossible à {request.RequestUri}"));

        await Create(handler, logger: logger).SignalAsync("daily-generate-challenge", succeeded: true, Ct);

        var log = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Warning, log.Level);
        Assert.Null(log.Exception);
        Assert.DoesNotContain(Key, log.Message);
    }

    [Fact]
    public async Task DelaiDepasse_NeLevePas()
    {
        var logger = new CapturingLogger<JobHeartbeat>();
        var handler = new StubHttpHandler((_, _) => throw new TaskCanceledException("délai dépassé"));

        await Create(handler, logger: logger).SignalAsync("daily-generate-challenge", succeeded: true, Ct);

        Assert.Equal(LogLevel.Warning, Assert.Single(logger.Entries).Level);
    }

    private static StubHttpHandler Ok() =>
        new((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));

    private static JobHeartbeat Create(
        StubHttpHandler handler, string? key = Key, string? baseUrl = null, CapturingLogger<JobHeartbeat>? logger = null)
    {
        var options = new HealthchecksOptions { PingKey = key };
        if (baseUrl is not null)
            options.BaseUrl = baseUrl;
        return new JobHeartbeat(new HttpClient(handler), Options.Create(options), logger ?? new CapturingLogger<JobHeartbeat>());
    }
}

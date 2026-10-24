using System.Net;
using System.Text;
using InSeconds.IntegrationTests.Runs;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.IntegrationTests;

/// <summary><c>POST /api/csp-reports</c> : violations de la CSP envoyées par le navigateur (report-to, report-uri).</summary>
public class CspReportTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string ReportingApi = """
        [{"type":"csp-violation","age":10,"url":"https://inseconds.cc/daily","user_agent":"x",
          "body":{"documentURL":"https://inseconds.cc/daily?token=secret","blockedURL":"https://static.cloudflareinsights.com/beacon.min.js/v1",
                  "effectiveDirective":"script-src-elem","disposition":"report","sourceFile":"https://inseconds.cc/daily","lineNumber":12}}]
        """;

    private const string LegacyReport = """
        {"csp-report":{"document-uri":"https://inseconds.cc/privacy","blocked-uri":"https://evil.test/a.js?x=1",
                       "effective-directive":"script-src-elem","disposition":"enforce"}}
        """;

    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task ReportingApi_SansCookie_204_EtJournaliseCommeUneErreurDuFront()
    {
        var logs = new CapturingLoggerProvider();
        await using var api = new ApiFactory(_connectionString, services => services.AddSingleton<ILoggerProvider>(logs));

        var response = await PostAsync(api.CreateClient(), ReportingApi, "application/reports+json");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var entry = Assert.Single(logs.Messages, e => e.Contains("Erreur front (csp)", StringComparison.Ordinal));
        Assert.Contains("sur /daily : CSP (report) script-src-elem bloque https://static.cloudflareinsights.com/beacon.min.js/v1 depuis https://inseconds.cc/daily:12", entry);
        Assert.DoesNotContain("secret", entry);
    }

    [Fact]
    public async Task AncienFormatReportUri_204_EtJournalise_SansQueryString()
    {
        var logs = new CapturingLoggerProvider();
        await using var api = new ApiFactory(_connectionString, services => services.AddSingleton<ILoggerProvider>(logs));

        var response = await PostAsync(api.CreateClient(), LegacyReport, "application/csp-report");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var entry = Assert.Single(logs.Messages, e => e.Contains("Erreur front (csp)", StringComparison.Ordinal));
        Assert.Contains("sur /privacy : CSP (enforce) script-src-elem bloque https://evil.test/a.js ", entry);
        Assert.DoesNotContain("x=1", entry);
    }

    [Theory]
    [InlineData("pas du json")]
    [InlineData("""{"autre":1}""")]
    [InlineData("""[{"type":"deprecation","body":{}}]""")]
    [InlineData("""{"csp-report":{"document-uri":"https://inseconds.cc/","blocked-uri":"chrome-extension://abc/x.js","effective-directive":"script-src-elem"}}""")]
    public async Task RapportIllisibleOuSansInteret_204_SansRienJournaliser(string body)
    {
        var logs = new CapturingLoggerProvider();
        await using var api = new ApiFactory(_connectionString, services => services.AddSingleton<ILoggerProvider>(logs));

        var response = await PostAsync(api.CreateClient(), body, "application/csp-report");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.DoesNotContain(logs.Messages, e => e.Contains("Erreur front", StringComparison.Ordinal));
    }

    [Fact]
    public async Task RapportTropGros_Ignore()
    {
        var logs = new CapturingLoggerProvider();
        await using var api = new ApiFactory(_connectionString, services => services.AddSingleton<ILoggerProvider>(logs));
        var huge = LegacyReport.Replace("enforce", "enforce" + new string(' ', 70 * 1024), StringComparison.Ordinal);

        var response = await PostAsync(api.CreateClient(), huge, "application/csp-report");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.DoesNotContain(logs.Messages, e => e.Contains("Erreur front", StringComparison.Ordinal));
    }

    [Fact]
    public async Task RateLimiting_30RapportsPar5Minutes_PuisEn429()
    {
        await using var api = new ApiFactory(_connectionString,
            settings: new Dictionary<string, string> { ["RateLimiting:Enabled"] = "true" });
        var client = api.CreateClient();

        for (var i = 0; i < 30; i++)
            Assert.Equal(HttpStatusCode.NoContent, (await PostAsync(client, LegacyReport, "application/csp-report")).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await PostAsync(client, LegacyReport, "application/csp-report")).StatusCode);
    }

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, string body, string contentType) =>
        client.PostAsync("/api/csp-reports", new StringContent(body, Encoding.UTF8, contentType), TestContext.Current.CancellationToken);
}

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using InSeconds.Api.Infrastructure.Errors;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.IntegrationTests;

/// <summary><c>POST /api/client-errors</c> : erreurs remontées par le front (ErrorReportingService).</summary>
public class ClientErrorTests(PostgresFixture postgres) : IAsyncLifetime
{
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task ErreurJs_SansCookie_204()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await PostAsync(api.CreateClient(), new
        {
            source = "js",
            message = "TypeError: x is undefined",
            stack = "at a\nat b",
            url = "/daily",
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task ErreurHttp_AvecTraceLiee_204()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await PostAsync(api.CreateClient(), new
        {
            source = "http",
            message = "Http failure response for /api/x: 503",
            httpStatus = 503,
            relatedTraceId = new string('a', 32),
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Theory]
    [InlineData("autre", "message")]
    [InlineData("js", "")]
    public async Task RapportInvalide_400AuFormatProblemDetails(string source, string message)
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await PostAsync(api.CreateClient(), new { source, message });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)).RootElement;
        Assert.Equal(ErrorCodes.BadRequest, problem.GetProperty("code").GetString());
        Assert.True(problem.TryGetProperty("traceId", out _));
    }

    [Fact]
    public async Task MessageTropLong_400()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await PostAsync(api.CreateClient(), new { source = "js", message = new string('m', 1001) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task RateLimiting_20RapportsPar5Minutes_PuisEn429()
    {
        await using var api = new ApiFactory(_connectionString,
            settings: new Dictionary<string, string> { ["RateLimiting:Enabled"] = "true" });
        var client = api.CreateClient();
        var report = new { source = "js", message = "boom" };

        for (var i = 0; i < 20; i++)
            Assert.Equal(HttpStatusCode.NoContent, (await PostAsync(client, report)).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await PostAsync(client, report)).StatusCode);
    }

    [Fact]
    public async Task Confidentialite_NiCookieNiAuthorizationNiQueryString_DansLesTracesEtLesJournaux()
    {
        // Mêmes règles qu'en v1 (TelemetryTests.Traces_NeContiennentNiCookieNiAuthorization), sur la
        // route qui recopie dans les journaux ce que le navigateur envoie.
        const string secret = "secret-a-ne-jamais-exporter";
        var logs = new CapturingLoggerProvider();
        var activities = new ConcurrentQueue<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Microsoft.AspNetCore",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activities.Enqueue,
        };
        ActivitySource.AddActivityListener(listener);
        await using var api = new ApiFactory(_connectionString, services => services.AddSingleton<ILoggerProvider>(logs));

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/client-errors")
        {
            Content = JsonContent.Create(new { source = "js", message = "boom", url = $"/account/login/verify?token={secret}" }),
        };
        request.Headers.Add("Cookie", $"authToken={secret}");
        request.Headers.Add("Authorization", $"Bearer {secret}");
        var response = await api.CreateClient().SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        // L'activité de la requête s'arrête à la fin du pipeline, parfois juste après la réponse.
        for (var i = 0; i < 40 && !activities.Any(IsClientErrorRequest); i++)
            await Task.Delay(50, TestContext.Current.CancellationToken);

        Assert.Contains(activities, IsClientErrorRequest);
        foreach (var tag in activities.SelectMany(a => a.TagObjects))
        {
            Assert.DoesNotContain("cookie", tag.Key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("authorization", tag.Key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(secret, tag.Value?.ToString() ?? "");
        }
        Assert.Contains(logs.Entries, e => e.Contains("Erreur front", StringComparison.Ordinal));
        Assert.DoesNotContain(logs.Entries, e => e.Contains(secret, StringComparison.Ordinal));
    }

    private static bool IsClientErrorRequest(Activity activity) =>
        activity.GetTagItem("url.path") as string == "/api/client-errors";

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, object body) =>
        client.PostAsJsonAsync("/api/client-errors", body, TestContext.Current.CancellationToken);

    /// <summary>Garde chaque journal : message formaté et valeurs de ses propriétés.</summary>
    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _entries = new();

        public IReadOnlyCollection<string> Entries => _entries;

        public ILogger CreateLogger(string categoryName) => new Logger(_entries);

        public void Dispose()
        {
        }

        private sealed class Logger(ConcurrentQueue<string> entries) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                var values = state is IEnumerable<KeyValuePair<string, object?>> pairs
                    ? string.Join(" ", pairs.Select(p => p.Value))
                    : "";
                entries.Enqueue($"{formatter(state, exception)} {values}");
            }
        }
    }
}

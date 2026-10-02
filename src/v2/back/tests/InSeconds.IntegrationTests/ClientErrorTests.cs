using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using InSeconds.Api.Infrastructure.Errors;

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

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, object body) =>
        client.PostAsJsonAsync("/api/client-errors", body, TestContext.Current.CancellationToken);
}

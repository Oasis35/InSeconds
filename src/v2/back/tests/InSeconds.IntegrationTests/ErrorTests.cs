using System.Net;
using System.Text.Json;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests;

public class ErrorTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string InternalMessage = "détail interne à ne jamais montrer";
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task RouteInconnue_404AuFormatProblemDetails()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().GetAsync("/api/nothing-here", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await ReadProblemAsync(response);
        Assert.Equal(ErrorCodes.NotFound, problem.GetProperty("code").GetString());
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task ExceptionNonGeree_500SansLeMessageNiLaPile()
    {
        await using var api = new ApiFactory(_connectionString,
            services => services.AddSingleton<IGameCalendar, ThrowingCalendar>());

        var response = await api.CreateClient().GetAsync("/health", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.DoesNotContain(InternalMessage, raw);
        Assert.DoesNotContain(nameof(ThrowingCalendar), raw);

        var problem = await ReadProblemAsync(response);
        Assert.Equal(ErrorCodes.Unexpected, problem.GetProperty("code").GetString());
        Assert.Equal(ProblemDetailsSetup.UnexpectedTitle, problem.GetProperty("title").GetString());
        Assert.Matches("^[0-9a-f]{32}$", problem.GetProperty("traceId").GetString());
    }

    private static async Task<JsonElement> ReadProblemAsync(HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    private sealed class ThrowingCalendar : IGameCalendar
    {
        public DateTimeOffset Now => throw new InvalidOperationException(InternalMessage);

        public DateOnly Today => throw new InvalidOperationException(InternalMessage);

        public DateTimeOffset StartOf(DateOnly day) => throw new InvalidOperationException(InternalMessage);
    }
}

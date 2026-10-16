using System.Net;
using System.Text.Json;
using InSeconds.Api.Infrastructure.Errors;

namespace InSeconds.IntegrationTests;

/// <summary>Les routes de la v1 répondent 410 <c>common.new_version</c> après la bascule (§ 10.2 du plan v2).</summary>
public class LegacyRoutesTests(PostgresFixture postgres) : IAsyncLifetime
{
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Theory]
    [InlineData("GET", "/api/sessions/today")]
    [InlineData("POST", "/api/sessions")]
    [InlineData("POST", "/api/sessions/12/answers")]
    [InlineData("PUT", "/api/sessions/12/abandon")]
    [InlineData("PATCH", "/api/sessions/12/listening")]
    [InlineData("GET", "/api/stats/today")]
    [InlineData("GET", "/api/settings")]
    [InlineData("GET", "/api/deezer/search?q=daft")]
    [InlineData("POST", "/api/auth/magic-link/request")]
    [InlineData("POST", "/api/auth/logout")]
    [InlineData("PUT", "/api/players/me/email")]
    [InlineData("GET", "/api/admin/stats")]
    [InlineData("GET", "/api/admin/challenges")]
    [InlineData("DELETE", "/api/admin/tracks/3")]
    [InlineData("GET", "/api/admin/players/6f9619ff-8b86-d011-b42d-00cf4fc964ff/history")]
    public async Task AncienneRoute_410AvecLeCodeNewVersion(string method, string path)
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().SendAsync(new HttpRequestMessage(new HttpMethod(method), path),
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Gone, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)).RootElement;
        Assert.Equal(ErrorCodes.NewVersion, problem.GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("/api/players/me")]
    [InlineData("/api/admin/me")]
    [InlineData("/api/daily/today")]
    public async Task RouteDeLaV2_PasEn410(string path)
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().GetAsync(path, TestContext.Current.CancellationToken);

        Assert.NotEqual(HttpStatusCode.Gone, response.StatusCode);
    }

    [Fact]
    public async Task RouteInconnue_RestEn404()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().GetAsync("/api/admin/nothing-here", TestContext.Current.CancellationToken);

        Assert.NotEqual(HttpStatusCode.Gone, response.StatusCode);
    }
}

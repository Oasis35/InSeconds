using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Time;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace InSeconds.IntegrationTests.Security;

/// <summary>
/// Le front appelle l'API depuis un autre sous-domaine, avec le cookie (<c>dev.inseconds.cc</c> →
/// <c>api-dev.inseconds.cc</c> en staging) : seules les origines de <c>Cors:AllowedOrigins</c> lisent
/// les réponses.
/// </summary>
public class CorsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Front = "https://front.example";
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task OrigineAutorisee_PeutLireLaReponseAvecLeCookie()
    {
        await using var api = CreateApi();

        var response = await GetHealthAsync(api.CreateClient(), Front);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Front, Header(response, "Access-Control-Allow-Origin"));
        Assert.Equal("true", Header(response, "Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task OrigineInconnue_AucunEnTeteCors()
    {
        await using var api = CreateApi();

        var response = await GetHealthAsync(api.CreateClient(), "https://autre-site.example");

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task RequetePrealable_RepondueSansCookie()
    {
        await using var api = CreateApi();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/client-errors");
        request.Headers.Add("Origin", Front);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");

        var response = await api.CreateClient().SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(Front, Header(response, "Access-Control-Allow-Origin"));
        Assert.Equal("true", Header(response, "Access-Control-Allow-Credentials"));
        Assert.Contains("POST", Header(response, "Access-Control-Allow-Methods"));
        Assert.Contains("content-type", Header(response, "Access-Control-Allow-Headers"), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ExceptionNonGeree_GardeLesEnTetesCors()
    {
        // Sans en-tête CORS, le navigateur masque la réponse : le front ne pourrait pas lire le code d'erreur.
        await using var api = CreateApi(services => services.AddSingleton<IGameCalendar, ThrowingCalendar>());

        var response = await GetHealthAsync(api.CreateClient(), Front);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(Front, Header(response, "Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Staging_LeFrontDuStagingAppelleLApi()
    {
        await using var api = new ApiFactory(_connectionString, environment: Environments.Staging,
            // Exigés au démarrage en staging (EmailStartupTests, DataProtectionTests).
            settings: TestCertificate.StagingSettings());
        var client = api.CreateClient();

        var health = await GetHealthAsync(client, "https://dev.inseconds.cc");
        using var report = new HttpRequestMessage(HttpMethod.Post, "/api/client-errors")
        {
            Content = JsonContent.Create(new { source = "js", message = "boom" }),
        };
        report.Headers.Add("Origin", "https://dev.inseconds.cc");
        var reported = await client.SendAsync(report, TestContext.Current.CancellationToken);

        Assert.Equal("https://dev.inseconds.cc", Header(health, "Access-Control-Allow-Origin"));
        Assert.Equal(HttpStatusCode.NoContent, reported.StatusCode);
        Assert.Equal("https://dev.inseconds.cc", Header(reported, "Access-Control-Allow-Origin"));
    }

    [Theory]
    [InlineData("https://inseconds.cc")]
    [InlineData("https://www.inseconds.cc")]
    public async Task Production_LeFrontDeLaProdAppelleLApi(string origin)
    {
        // Exigés au démarrage en production (EmailStartupTests, DataProtectionTests).
        await using var api = new ApiFactory(_connectionString, environment: Environments.Production,
            settings: new Dictionary<string, string>(TestCertificate.Settings()) { ["Brevo:ApiKey"] = "clé" });
        var client = api.CreateClient();

        var allowed = await GetHealthAsync(client, origin);
        var staging = await GetHealthAsync(client, "https://dev.inseconds.cc");

        Assert.Equal(origin, Header(allowed, "Access-Control-Allow-Origin"));
        Assert.Equal("true", Header(allowed, "Access-Control-Allow-Credentials"));
        Assert.False(staging.Headers.Contains("Access-Control-Allow-Origin"));
    }

    private ApiFactory CreateApi(Action<IServiceCollection>? configureServices = null) =>
        new(_connectionString, configureServices, new Dictionary<string, string> { ["Cors:AllowedOrigins:0"] = Front });

    private static async Task<HttpResponseMessage> GetHealthAsync(HttpClient client, string origin)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Origin", origin);
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    private static string Header(HttpResponseMessage response, string name) =>
        response.Headers.TryGetValues(name, out var values) ? string.Join(",", values) : "";

    private sealed class ThrowingCalendar : IGameCalendar
    {
        public DateTimeOffset Now => throw new InvalidOperationException("calendrier indisponible");

        public DateOnly Today => throw new InvalidOperationException("calendrier indisponible");

        public DateTimeOffset StartOf(DateOnly day) => throw new InvalidOperationException("calendrier indisponible");
    }
}

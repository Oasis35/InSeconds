using System.Net;
using System.Text.RegularExpressions;
using InSeconds.Infrastructure.Http;

namespace InSeconds.IntegrationTests.Security;

/// <summary>S15 : en-têtes de sécurité sur toutes les réponses, erreurs comprises.</summary>
public partial class SecurityHeadersTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync() => _api = new ApiFactory(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Theory]
    [InlineData("/health", HttpStatusCode.OK)]
    [InlineData("/api/nothing-here", HttpStatusCode.NotFound)]
    [InlineData("/api/admin/jobs/1", HttpStatusCode.Unauthorized)]
    public async Task Api_EnTetesPresents(string path, HttpStatusCode expected)
    {
        var response = await _api.CreateClient().GetAsync(path, TestContext.Current.CancellationToken);

        Assert.Equal(expected, response.StatusCode);
        AssertHeader(response, "Content-Security-Policy", SecurityHeaders.ApiContentSecurityPolicy);
        AssertHeader(response, "X-Content-Type-Options", "nosniff");
        AssertHeader(response, "X-Frame-Options", "DENY");
        AssertHeader(response, "Referrer-Policy", "no-referrer");
        AssertHeader(response, "Strict-Transport-Security", "max-age=31536000");
    }

    [Fact]
    public async Task TableauDeBord_CspPropre_EtAucunScriptEnLigne()
    {
        var response = await _api.CreateClient(TestUser.Admin).GetAsync("/jobs", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertHeader(response, "Content-Security-Policy", SecurityHeaders.DashboardContentSecurityPolicy);
        // La CSP interdit les scripts en ligne : une mise à jour de Hangfire qui en ajouterait un
        // casserait le tableau de bord, ce test le signale avant.
        var html = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.DoesNotMatch(InlineScript(), html);
        Assert.Matches(ExternalScript(), html);
    }

    private static void AssertHeader(HttpResponseMessage response, string name, string expected)
    {
        Assert.True(response.Headers.TryGetValues(name, out var values), $"En-tête {name} absent");
        Assert.Equal(expected, Assert.Single(values));
    }

    [GeneratedRegex(@"<script(?![^>]*\bsrc=)[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex InlineScript();

    [GeneratedRegex(@"<script[^>]*\bsrc=", RegexOptions.IgnoreCase)]
    private static partial Regex ExternalScript();
}

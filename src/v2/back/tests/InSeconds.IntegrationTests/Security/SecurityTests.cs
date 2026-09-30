using System.Net;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Security;

/// <summary>
/// Filet de sécurité sur toutes les routes réservées aux admins (<c>/api/admin</c> et <c>/jobs</c>) :
/// la liste est lue dans l'API elle-même, donc une route ajoutée plus tard est vérifiée sans toucher
/// à ce fichier. Les tests de sécurité propres à chaque module (S1 à S16) viendront s'ajouter ici.
/// </summary>
public partial class SecurityTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync() => _api = new ApiFactory(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task RoutesAdmin_401SansJoueur_403SansLeRoleAdmin()
    {
        var routes = AdminRoutes();
        Assert.NotEmpty(routes);

        var anonymous = _api.CreateClient();
        var player = _api.CreateClient(TestUser.Player);
        var failures = new List<string>();
        foreach (var (method, path) in routes)
        {
            var anonymousStatus = await SendAsync(anonymous, method, path);
            if (anonymousStatus != HttpStatusCode.Unauthorized)
                failures.Add($"{method} {path} anonyme : {(int)anonymousStatus}");

            var playerStatus = await SendAsync(player, method, path);
            if (playerStatus != HttpStatusCode.Forbidden)
                failures.Add($"{method} {path} joueur : {(int)playerStatus}");
        }

        Assert.Empty(failures);
    }

    [Fact]
    public void LesRoutesDeTestNeSontPasDansLApi() =>
        Assert.DoesNotContain(AllRoutes(), r => r.Path.StartsWith("/api/e2e", StringComparison.OrdinalIgnoreCase));

    private List<(string Method, string Path)> AdminRoutes() =>
        AllRoutes()
            .Where(r => r.Path.StartsWith("/api/admin", StringComparison.OrdinalIgnoreCase)
                        || r.Path.Equals("/jobs", StringComparison.OrdinalIgnoreCase)
                        || r.Path.StartsWith("/jobs/", StringComparison.OrdinalIgnoreCase))
            .ToList();

    private List<(string Method, string Path)> AllRoutes()
    {
        // Démarre l'hôte avant de lire ses routes.
        _ = _api.Server;
        return _api.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .SelectMany(e => (e.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods ?? ["GET"])
                .Select(method => (method, ToPath(e.RoutePattern.RawText ?? ""))))
            .Distinct()
            .ToList();
    }

    /// <summary>Remplace chaque paramètre de route par une valeur quelconque (<c>{id}</c> → <c>1</c>).</summary>
    private static string ToPath(string pattern)
    {
        var path = RouteParameter().Replace(pattern, "1");
        return path.StartsWith('/') ? path : "/" + path;
    }

    private static async Task<HttpStatusCode> SendAsync(HttpClient client, string method, string path)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method is "POST" or "PUT" or "PATCH")
            request.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        return response.StatusCode;
    }

    [GeneratedRegex(@"\{[^}]+\}")]
    private static partial Regex RouteParameter();
}

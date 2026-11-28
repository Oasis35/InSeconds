using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using static InSeconds.IntegrationTests.Catalogue.CatalogueApi;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>
/// Confidentialité de la télémétrie : le texte tapé dans l'autocomplétion (potentiellement une donnée personnelle,
/// piège 36) ne doit apparaître dans aucun tag de trace. Le span serveur ne porte pas la requête (et l'instrumentation
/// OpenTelemetry masque <c>url.query</c> par défaut) ; ce test le prouve sur la route de recherche, publique et sans cookie.
/// (Les requêtes vers Deezer sont masquées de la même façon par l'instrumentation HttpClient, qui n'a pas de span
/// ici : l'hôte de test remplace le transport HTTP.)
/// </summary>
public class SearchTelemetryTests(PostgresFixture postgres) : IAsyncLifetime
{
    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task RechercheDuJoueur_LeTexteTapeNApparaitDansAucunTagDeTrace()
    {
        const string secret = "un-nom-tres-identifiant-clement-rageau";
        var activities = new ConcurrentQueue<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Microsoft.AspNetCore",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activities.Enqueue,
        };
        ActivitySource.AddActivityListener(listener);

        var response = await _app.Api.CreateClient().GetAsync($"/api/catalogue/search?q={secret}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Le span serveur se ferme à la fin de la requête, un peu après que le client a reçu la réponse.
        var request = await Waiting.UntilAsync(
            () => Task.FromResult(activities.FirstOrDefault(a => a.GetTagItem("url.path") as string == "/api/catalogue/search")),
            found => found is not null, "Le span de la recherche n'a pas été fermé.", Ct);

        Assert.NotNull(request);
        foreach (var tag in request.TagObjects)
            Assert.DoesNotContain(secret, tag.Value?.ToString() ?? "", StringComparison.Ordinal);
        // Le span serveur ne porte aucune valeur de requête : le tag est absent ou sa valeur est masquée (« q=Redacted »).
        Assert.True(request.GetTagItem("url.query") is not string query || query.Contains("Redacted", StringComparison.Ordinal));
    }
}

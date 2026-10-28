namespace InSeconds.IntegrationTests.Testing;

/// <summary>
/// Document OpenAPI du module Runs : servi par l'hôte de test seulement, pour générer le client NSwag du front. Préfixes <c>api/runs</c> (la partie)
/// et <c>api/admin/runs</c> (l'accès).
/// </summary>
public class RunsOpenApiTests(PostgresFixture postgres) : OpenApiDocumentTests(postgres, "runs")
{
    [Fact]
    public async Task L_hote_de_test_sert_le_document_du_module_Runs()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(
            [
                "abandonRun", "getRunChallenge", "getRunComparison", "getRunSession", "getRunsMe", "grantRunAccess", "joinRun", "launchRun", "listRunAccess",
                "refreshRunPreview", "revokeRunAccess", "submitRunAnswer", "updateRunListening",
            ],
            OperationIds(document).Order(StringComparer.Ordinal));
        Assert.All(document["paths"]!.AsObject().Select(p => p.Key), path =>
            Assert.True(path.StartsWith("/api/runs", StringComparison.Ordinal) || path.StartsWith("/api/admin/runs", StringComparison.Ordinal), path));
    }

    [Fact]
    public async Task Les_routes_de_l_acces_n_ont_ni_corps_ni_reponse_a_decoder()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal("/api/admin/runs/access", PathOf(document, "listRunAccess"));
        Assert.Equal("/api/admin/runs/access/{playerId}", PathOf(document, "grantRunAccess"));
        Assert.Equal("put", MethodOf(document, "grantRunAccess"));
        Assert.Equal("delete", MethodOf(document, "revokeRunAccess"));
        foreach (var id in new[] { "grantRunAccess", "revokeRunAccess" })
        {
            var operation = Operation(document, id);
            // Le joueur est dans l'adresse : pas de corps de requête (la cible chargée par Wolverine n'est pas un corps).
            Assert.Null(operation["requestBody"]);
            Assert.Null(operation["responses"]!["204"]!["content"]);
            Assert.NotNull(operation["responses"]!["404"]);
        }

        Assert.Null(Operation(document, "listRunAccess")["responses"]!["404"]);
    }

    [Fact]
    public async Task Les_routes_de_la_partie_sans_corps_n_en_declarent_pas()
    {
        var document = await ReadDocumentAsync();

        // Le défi, la partie ou le lancement sont chargés par Wolverine : jamais un corps de requête.
        foreach (var id in new[] { "launchRun", "joinRun", "refreshRunPreview", "abandonRun", "getRunsMe", "getRunChallenge", "getRunComparison", "getRunSession" })
            Assert.Null(Operation(document, id)["requestBody"]);
        Assert.NotNull(Operation(document, "submitRunAnswer")["requestBody"]);
        Assert.NotNull(Operation(document, "updateRunListening")["requestBody"]);
        Assert.NotNull(Operation(document, "launchRun")["responses"]!["429"]);
        Assert.NotNull(Operation(document, "getRunChallenge")["responses"]!["429"]);
    }

    [Fact]
    public async Task La_comparaison_declare_ses_refus()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal("/api/runs/challenges/{code}/comparison", PathOf(document, "getRunComparison"));
        Assert.Equal("get", MethodOf(document, "getRunComparison"));
        var responses = Operation(document, "getRunComparison")["responses"]!;
        // Fermée avant la fin de sa propre partie (409), playlist inconnue (404), sans identité (401), trop de lectures (429).
        foreach (var status in new[] { "401", "404", "409", "429" })
            Assert.NotNull(responses[status]);
    }
}

namespace InSeconds.IntegrationTests.Testing;

/// <summary>
/// Document OpenAPI des routes admin transverses : le dernier passage des tâches planifiées
/// (<c>GET /api/admin/jobs/last-runs</c>) et l'état du système (<c>GET /api/admin/system</c> : commit de l'API, dernière sauvegarde). Servi par l'hôte de test seulement, pour générer le client NSwag du front de l'admin.
/// </summary>
public class AdminOpenApiTests(PostgresFixture postgres) : OpenApiDocumentTests(postgres, "admin")
{
    [Fact]
    public async Task L_hote_de_test_sert_le_document_du_suivi_des_taches_et_du_systeme()
    {
        var document = await ReadDocumentAsync();

        var operations = document["paths"]!.AsObject().SelectMany(path => path.Value!.AsObject().Select(op => (Path: path.Key, Method: op.Key, Id: op.Value!["operationId"]!.GetValue<string>())));
        Assert.Equal(
            [("/api/admin/jobs/last-runs", "get", "getJobLastRuns"), ("/api/admin/system", "get", "getSystemInfo")],
            operations.OrderBy(op => op.Path));
    }

    [Fact]
    public async Task La_reponse_est_typee()
    {
        var document = await ReadDocumentAsync();
        var schemas = document["components"]!["schemas"]!.AsObject();
        var responses = document["paths"]!["/api/admin/jobs/last-runs"]!["get"]!["responses"]!.AsObject();

        Assert.Equal(["200"], responses.Select(r => r.Key));
        var schema = responses["200"]!["content"]!.AsObject().Single().Value!["schema"]!;
        Assert.Equal("array", schema["type"]!.GetValue<string>());
        Assert.Equal("#/components/schemas/JobLastRun", schema["items"]!["$ref"]!.GetValue<string>());
        Assert.True(schemas.ContainsKey("JobLastRun"));
    }
}

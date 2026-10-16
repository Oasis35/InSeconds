using System.Net;
using System.Text.Json.Nodes;

namespace InSeconds.IntegrationTests.Testing;

/// <summary>
/// Document OpenAPI des routes admin transverses (F2, § 6.1 du plan v2) : le dernier passage des tâches planifiées, témoins de
/// l'onglet Actions (<c>GET /api/admin/jobs/last-runs</c>). Servi par l'hôte de test seulement, pour générer le client NSwag du front de l'admin.
/// </summary>
public class AdminOpenApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/openapi/admin.json";

    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task L_hote_de_test_sert_le_document_du_suivi_des_taches()
    {
        var document = await ReadDocumentAsync();

        var operation = Assert.Single(document["paths"]!.AsObject().SelectMany(path => path.Value!.AsObject().Select(op => (Path: path.Key, Method: op.Key, Id: op.Value!["operationId"]!.GetValue<string>()))));
        Assert.Equal(("/api/admin/jobs/last-runs", "get", "getJobLastRuns"), operation);
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

    [Fact]
    public async Task Le_document_sauvegarde_pour_le_front_est_a_jour()
    {
        var served = await ReadDocumentAsync();
        var saved = JsonNode.Parse(await File.ReadAllTextAsync(SavedDocumentPath(), Ct))!;

        Assert.True(
            JsonNode.DeepEquals(saved, served),
            "InSeconds.Api.Testing/openapi/admin.json est périmé : le régénérer (cf. CLAUDE.md du back, « Document OpenAPI »).");
    }

    [Fact]
    public async Task L_API_de_prod_ne_sert_aucun_document_OpenAPI()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().GetAsync(Route, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private async Task<JsonNode> ReadDocumentAsync()
    {
        await using var host = new TestingFactory(_connectionString);
        var response = await host.CreateClient().GetAsync(Route, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync(Ct))!;
    }

    private static string SavedDocumentPath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "InSeconds.Api.Testing", "openapi", "admin.json");
            if (File.Exists(candidate))
                return candidate;
        }

        throw new FileNotFoundException("InSeconds.Api.Testing/openapi/admin.json est introuvable.");
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

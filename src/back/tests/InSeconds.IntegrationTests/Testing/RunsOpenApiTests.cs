using System.Net;
using System.Text.Json.Nodes;

namespace InSeconds.IntegrationTests.Testing;

/// <summary>
/// Document OpenAPI du module Runs : servi par l'hôte de test seulement, pour générer le client NSwag du front. Préfixes <c>api/runs</c> (les routes
/// joueur, à venir) et <c>api/admin/runs</c> (l'accès).
/// </summary>
public class RunsOpenApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/openapi/runs.json";

    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task L_hote_de_test_sert_le_document_du_module_Runs()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(["grantRunAccess", "listRunAccess", "revokeRunAccess"], OperationIds(document).Order(StringComparer.Ordinal));
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
    public async Task Le_document_sauvegarde_pour_le_front_est_a_jour()
    {
        var served = await ReadDocumentAsync();
        var saved = JsonNode.Parse(await File.ReadAllTextAsync(SavedDocumentPath(), Ct))!;

        Assert.True(
            JsonNode.DeepEquals(saved, served),
            "InSeconds.Api.Testing/openapi/runs.json est périmé : le régénérer (cf. CLAUDE.md du back, « Document OpenAPI »).");
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

    private static IEnumerable<string> OperationIds(JsonNode document) =>
        document["paths"]!.AsObject().SelectMany(path => path.Value!.AsObject().Select(op => op.Value!["operationId"]!.GetValue<string>()));

    private static JsonNode Operation(JsonNode document, string operationId) =>
        document["paths"]!.AsObject()
            .SelectMany(path => path.Value!.AsObject().Select(op => op.Value!))
            .Single(op => op["operationId"]!.GetValue<string>() == operationId);

    private static string PathOf(JsonNode document, string operationId) =>
        document["paths"]!.AsObject()
            .Single(path => path.Value!.AsObject().Any(op => op.Value!["operationId"]!.GetValue<string>() == operationId)).Key;

    private static string MethodOf(JsonNode document, string operationId) =>
        document["paths"]!.AsObject()
            .SelectMany(path => path.Value!.AsObject())
            .Single(op => op.Value!["operationId"]!.GetValue<string>() == operationId).Key;

    private static string SavedDocumentPath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "InSeconds.Api.Testing", "openapi", "runs.json");
            if (File.Exists(candidate))
                return candidate;
        }

        throw new FileNotFoundException("InSeconds.Api.Testing/openapi/runs.json est introuvable.");
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

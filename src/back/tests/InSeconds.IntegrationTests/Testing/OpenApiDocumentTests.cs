using System.Net;
using System.Text.Json.Nodes;

namespace InSeconds.IntegrationTests.Testing;

/// <summary>
/// Base des tests d'un document OpenAPI de l'hôte de test (<c>/openapi/{name}.json</c>, un par module). Porte les deux vérifications
/// communes à tous les documents (le document sauvegardé pour le front est à jour, l'API de prod n'en sert aucun) et les lectures
/// du document ; chaque classe fille vérifie les opérations et les schémas de son module.
/// </summary>
public abstract class OpenApiDocumentTests(PostgresFixture postgres, string documentName) : IAsyncLifetime
{
    private string Route => $"/openapi/{documentName}.json";

    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Le_document_sauvegarde_pour_le_front_est_a_jour()
    {
        var served = await ReadDocumentAsync();
        var saved = JsonNode.Parse(await File.ReadAllTextAsync(SavedDocumentPath(), Ct))!;

        Assert.True(
            JsonNode.DeepEquals(saved, served),
            $"InSeconds.Api.Testing/openapi/{documentName}.json est périmé : le régénérer (cf. CLAUDE.md du back, « Document OpenAPI »).");
    }

    [Fact]
    public async Task L_API_de_prod_ne_sert_aucun_document_OpenAPI()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().GetAsync(Route, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    protected async Task<JsonNode> ReadDocumentAsync()
    {
        await using var host = new TestingFactory(_connectionString);
        var response = await host.CreateClient().GetAsync(Route, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync(Ct))!;
    }

    protected static IEnumerable<string> OperationIds(JsonNode document) =>
        document["paths"]!.AsObject().SelectMany(path => path.Value!.AsObject().Select(op => op.Value!["operationId"]!.GetValue<string>()));

    protected static JsonNode Operation(JsonNode document, string operationId) =>
        document["paths"]!.AsObject()
            .SelectMany(path => path.Value!.AsObject().Select(op => op.Value!))
            .Single(op => op["operationId"]!.GetValue<string>() == operationId);

    protected static string PathOf(JsonNode document, string operationId) =>
        document["paths"]!.AsObject()
            .Single(path => path.Value!.AsObject().Any(op => op.Value!["operationId"]!.GetValue<string>() == operationId)).Key;

    protected static string MethodOf(JsonNode document, string operationId) =>
        document["paths"]!.AsObject()
            .SelectMany(path => path.Value!.AsObject())
            .Single(op => op.Value!["operationId"]!.GetValue<string>() == operationId).Key;

    /// <summary>Les codes de réponse documentés d'une opération, triés.</summary>
    protected static IEnumerable<string> Codes(JsonNode document, string operationId) =>
        Operation(document, operationId)["responses"]!.AsObject().Select(r => r.Key).Order(StringComparer.Ordinal);

    protected static string ResponseSchemaRef(JsonNode document, string operationId, string status)
    {
        var content = Operation(document, operationId)["responses"]![status]!["content"]!.AsObject().Single().Value!;
        return content["schema"]!["$ref"]!.GetValue<string>();
    }

    private string SavedDocumentPath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "InSeconds.Api.Testing", "openapi", $"{documentName}.json");
            if (File.Exists(candidate))
                return candidate;
        }

        throw new FileNotFoundException($"InSeconds.Api.Testing/openapi/{documentName}.json est introuvable.");
    }

    protected static CancellationToken Ct => TestContext.Current.CancellationToken;
}

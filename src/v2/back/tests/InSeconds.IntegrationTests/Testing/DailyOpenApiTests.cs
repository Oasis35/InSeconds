using System.Net;
using System.Text.Json.Nodes;

namespace InSeconds.IntegrationTests.Testing;

/// <summary>
/// Document OpenAPI du module Daily (E5, § 6.1 du plan v2) : servi par l'hôte de test seulement, pour générer le client NSwag du
/// front du jeu. Deux préfixes : les routes du joueur et celles de l'admin (défi du jour, statistiques, récap).
/// </summary>
public class DailyOpenApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/openapi/daily.json";

    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task L_hote_de_test_sert_le_document_du_module_Daily()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(
            [
                "abandonSession", "generateToday", "getDailySettings", "getToday", "getTodayStats", "getWeeklyRecap", "recomputeDayStats",
                "requestHint", "startSession", "submitAnswer", "updateListening",
            ],
            OperationIds(document).Order(StringComparer.Ordinal));
        // Rien d'autre que le module : ni Players, ni Catalogue, ni /api/e2e.
        Assert.All(document["paths"]!.AsObject().Select(p => p.Key), path =>
            Assert.True(path.StartsWith("/api/daily", StringComparison.Ordinal) || path.StartsWith("/api/admin/daily", StringComparison.Ordinal), path));
    }

    [Fact]
    public async Task Les_routes_et_methodes_sont_celles_du_plan()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(("get", "/api/daily/today"), (MethodOf(document, "getToday"), PathOf(document, "getToday")));
        Assert.Equal(("get", "/api/daily/settings"), (MethodOf(document, "getDailySettings"), PathOf(document, "getDailySettings")));
        Assert.Equal(("post", "/api/daily/sessions"), (MethodOf(document, "startSession"), PathOf(document, "startSession")));
        Assert.Equal(("patch", "/api/daily/sessions/{id}/listening"), (MethodOf(document, "updateListening"), PathOf(document, "updateListening")));
        Assert.Equal(("post", "/api/daily/sessions/{id}/hints"), (MethodOf(document, "requestHint"), PathOf(document, "requestHint")));
        Assert.Equal(("post", "/api/daily/sessions/{id}/answers"), (MethodOf(document, "submitAnswer"), PathOf(document, "submitAnswer")));
        Assert.Equal(("post", "/api/daily/sessions/{id}/abandon"), (MethodOf(document, "abandonSession"), PathOf(document, "abandonSession")));
        Assert.Equal(("get", "/api/daily/stats/today"), (MethodOf(document, "getTodayStats"), PathOf(document, "getTodayStats")));
    }

    [Fact]
    public async Task Les_decimaux_sont_des_nombres_et_les_entiers_des_entiers()
    {
        var schemas = (await ReadDocumentAsync())["components"]!["schemas"]!;

        // Une durée en secondes est un nombre (jamais « nombre ou texte » : le client généré aurait un type union).
        Assert.Equal("number", schemas["SubmitAnswerResponse"]!["properties"]!["listenedSeconds"]!["type"]!.GetValue<string>());
        Assert.Equal("number", schemas["DurationScoreResponse"]!["properties"]!["seconds"]!["type"]!.GetValue<string>());
        // Une moyenne peut manquer (personne n'a trouvé) : nombre ou nul.
        Assert.Equal(
            ["null", "number"],
            schemas["SubmitAnswerResponse"]!["properties"]!["averageSecondsWhenCorrect"]!["type"]!.AsArray().Select(t => t!.GetValue<string>()).Order(StringComparer.Ordinal));
        Assert.Equal("integer", schemas["SubmitAnswerResponse"]!["properties"]!["score"]!["type"]!.GetValue<string>());
        Assert.Null(schemas["SubmitAnswerResponse"]!["properties"]!["listenedSeconds"]!["pattern"]);
    }

    [Fact]
    public async Task Les_erreurs_ProblemDetails_sont_documentees_sans_404_fantome()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(["200", "400", "401", "409", "503"], Codes(document, "startSession"));
        Assert.Equal(["200", "400", "401", "404", "409"], Codes(document, "submitAnswer"));
        Assert.Equal(["204", "400", "401", "404", "409"], Codes(document, "updateListening"));
        // Une 204 n'a pas de corps ; un 404 sans schéma (déclaré partout par Wolverine) n'existe pas.
        Assert.Null(Operation(document, "updateListening")["responses"]!["204"]!["content"]);
        Assert.DoesNotContain("404", Codes(document, "getToday"));
        Assert.Equal("#/components/schemas/ProblemDetails", ResponseSchemaRef(document, "startSession", "409"));
    }

    [Fact]
    public async Task Le_document_sauvegarde_pour_le_front_est_a_jour()
    {
        var served = await ReadDocumentAsync();
        var saved = JsonNode.Parse(await File.ReadAllTextAsync(SavedDocumentPath(), Ct))!;

        Assert.True(
            JsonNode.DeepEquals(saved, served),
            "InSeconds.Api.Testing/openapi/daily.json est périmé : le régénérer (cf. CLAUDE.md du back, « Document OpenAPI »).");
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

    private static IEnumerable<string> Codes(JsonNode document, string operationId) =>
        Operation(document, operationId)["responses"]!.AsObject().Select(r => r.Key).Order(StringComparer.Ordinal);

    private static string ResponseSchemaRef(JsonNode document, string operationId, string status)
    {
        var content = Operation(document, operationId)["responses"]![status]!["content"]!.AsObject().Single().Value!;
        return content["schema"]!["$ref"]!.GetValue<string>();
    }

    private static string SavedDocumentPath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "InSeconds.Api.Testing", "openapi", "daily.json");
            if (File.Exists(candidate))
                return candidate;
        }

        throw new FileNotFoundException("InSeconds.Api.Testing/openapi/daily.json est introuvable.");
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

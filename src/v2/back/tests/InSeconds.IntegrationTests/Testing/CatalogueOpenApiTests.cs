using System.Net;
using System.Text.Json.Nodes;

namespace InSeconds.IntegrationTests.Testing;

/// <summary>
/// Document OpenAPI du module Catalogue (C1, § 6.1 du plan v2) : servi par l'hôte de test seulement, pour générer le
/// client NSwag du front (C3). Deux préfixes : la recherche publique et les routes admin du pool.
/// </summary>
public class CatalogueOpenApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/openapi/catalogue.json";

    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task L_hote_de_test_sert_le_document_du_module_Catalogue()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(
            [
                "addTrack", "deleteTrack", "listTracks", "renameTrack", "searchDeezer", "searchTracks",
                "setTrackDisabled", "updateTrack",
            ],
            OperationIds(document).Order(StringComparer.Ordinal));
        // Rien d'autre que le module : ni Players, ni /api/e2e, ni les routes de tâches.
        Assert.All(document["paths"]!.AsObject().Select(p => p.Key), path =>
            Assert.True(path.StartsWith("/api/catalogue", StringComparison.Ordinal) || path.StartsWith("/api/admin/catalogue", StringComparison.Ordinal), path));
    }

    [Fact]
    public async Task Les_routes_et_methodes_sont_celles_du_plan()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal("get", MethodOf(document, "searchTracks"));
        Assert.Equal("/api/catalogue/search", PathOf(document, "searchTracks"));
        Assert.Equal("/api/admin/catalogue/tracks", PathOf(document, "listTracks"));
        Assert.Equal("post", MethodOf(document, "addTrack"));
        Assert.Equal("patch", MethodOf(document, "renameTrack"));
        Assert.Equal("put", MethodOf(document, "updateTrack"));
        Assert.Equal("/api/admin/catalogue/tracks/{id}/disabled", PathOf(document, "setTrackDisabled"));
        Assert.Equal("delete", MethodOf(document, "deleteTrack"));
        Assert.Equal("/api/admin/catalogue/deezer-search", PathOf(document, "searchDeezer"));
    }

    [Fact]
    public async Task Les_corps_et_les_reponses_sont_types()
    {
        var document = await ReadDocumentAsync();
        var schemas = document["components"]!["schemas"]!.AsObject().Select(s => s.Key).ToHashSet();

        foreach (var name in new[]
                 {
                     "AddTrack", "RenameTrack", "UpdateTrack", "SetTrackDisabled", "TrackSummary", "TrackListItem", "TrackDisabledResponse",
                     "TrackSuggestion", "DeezerTrackResult", "ProblemDetails",
                 })
            Assert.Contains(name, schemas);

        Assert.Equal("#/components/schemas/TrackSummary", ResponseSchemaRef(document, "addTrack", "200"));
        Assert.Equal("array", Operation(document, "listTracks")["responses"]!["200"]!["content"]!["application/json"]!["schema"]!["type"]!.GetValue<string>());
        // Une 204 n'a pas de corps.
        Assert.Null(Operation(document, "deleteTrack")["responses"]!["204"]!["content"]);
    }

    [Fact]
    public async Task Les_entiers_sont_des_nombres_et_un_entier_nullable_reste_nullable()
    {
        var properties = (await ReadDocumentAsync())["components"]!["schemas"]!["TrackListItem"]!["properties"]!;

        Assert.Equal("integer", properties["usageCount"]!["type"]!.GetValue<string>());
        // L'année et le rang peuvent être absents (morceau repris, jamais contrôlé).
        Assert.Equal(["integer", "null"], properties["releaseYear"]!["type"]!.AsArray().Select(t => t!.GetValue<string>()).Order(StringComparer.Ordinal));
        Assert.Equal(["integer", "null"], properties["rank"]!["type"]!.AsArray().Select(t => t!.GetValue<string>()).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Les_erreurs_ProblemDetails_sont_documentees_sans_404_fantome()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(["200", "400", "409", "422", "503"], Codes(document, "addTrack"));
        Assert.Equal(["200", "400", "404", "409", "422", "503"], Codes(document, "updateTrack"));
        Assert.Contains("409", Codes(document, "deleteTrack"));
        Assert.Contains("409", Codes(document, "setTrackDisabled"));
        Assert.Contains("404", Codes(document, "renameTrack"));
        Assert.Contains("429", Codes(document, "searchTracks"));
        // Wolverine déclare un 404 sans schéma partout : seul un vrai 404 reste.
        Assert.DoesNotContain("404", Codes(document, "addTrack"));
        Assert.DoesNotContain("404", Codes(document, "listTracks"));
        Assert.Equal("#/components/schemas/ProblemDetails", ResponseSchemaRef(document, "deleteTrack", "409"));
    }

    [Fact]
    public async Task Le_document_sauvegarde_pour_le_front_est_a_jour()
    {
        var served = await ReadDocumentAsync();
        var saved = JsonNode.Parse(await File.ReadAllTextAsync(SavedDocumentPath(), Ct))!;

        Assert.True(
            JsonNode.DeepEquals(saved, served),
            "InSeconds.Api.Testing/openapi/catalogue.json est périmé : le régénérer (cf. CLAUDE.md du back, « Document OpenAPI »).");
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
            var candidate = Path.Combine(directory.FullName, "InSeconds.Api.Testing", "openapi", "catalogue.json");
            if (File.Exists(candidate))
                return candidate;
        }

        throw new FileNotFoundException("InSeconds.Api.Testing/openapi/catalogue.json est introuvable.");
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

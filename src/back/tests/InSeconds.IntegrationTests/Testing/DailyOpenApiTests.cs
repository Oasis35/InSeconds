namespace InSeconds.IntegrationTests.Testing;

/// <summary>
/// Document OpenAPI du module Daily : servi par l'hôte de test seulement, pour générer le client NSwag du
/// front du jeu. Deux préfixes : les routes du joueur et celles de l'admin (défi du jour, statistiques, récap).
/// </summary>
public class DailyOpenApiTests(PostgresFixture postgres) : OpenApiDocumentTests(postgres, "daily")
{
    [Fact]
    public async Task L_hote_de_test_sert_le_document_du_module_Daily()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(
            [
                "abandonSession", "getAdminDailySettings", "getArchiveDay", "getArchiveIndex", "getArchivePreview", "getChallengeStats", "getDailySettings", "getDashboard",
                "getGamesPlayed", "getMyArchiveDay", "getPlayerHistory", "getToday", "getTodayStats", "getWeeklyRecap", "listChallenges", "listRegisteredPlayers", "recomputeDayStats", "requestHint",
                "startSession", "submitAnswer", "updateListening", "updateTrackCooldownPoolPercent",
            ],
            OperationIds(document).Order(StringComparer.Ordinal));
        // Rien d'autre que le module : ni Players, ni Catalogue, ni /api/e2e. La liste des joueurs inscrits (api/admin/players) est servie par Daily.
        Assert.All(document["paths"]!.AsObject().Select(p => p.Key), path =>
            Assert.True(
                path.StartsWith("/api/daily", StringComparison.Ordinal) || path.StartsWith("/api/admin/daily", StringComparison.Ordinal) || path == "/api/admin/players",
                path));
    }

    [Fact]
    public async Task Les_routes_admin_de_F1_sont_celles_du_plan()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(("get", "/api/admin/daily/dashboard"), (MethodOf(document, "getDashboard"), PathOf(document, "getDashboard")));
        Assert.Equal(("get", "/api/admin/daily/challenges/stats"), (MethodOf(document, "getChallengeStats"), PathOf(document, "getChallengeStats")));
        Assert.Equal(("get", "/api/admin/daily/challenges"), (MethodOf(document, "listChallenges"), PathOf(document, "listChallenges")));
        Assert.Equal(("get", "/api/admin/players"), (MethodOf(document, "listRegisteredPlayers"), PathOf(document, "listRegisteredPlayers")));
        Assert.Equal(("get", "/api/admin/daily/players/{playerId}/history"), (MethodOf(document, "getPlayerHistory"), PathOf(document, "getPlayerHistory")));
        Assert.Equal(("get", "/api/admin/daily/settings"), (MethodOf(document, "getAdminDailySettings"), PathOf(document, "getAdminDailySettings")));
        Assert.Equal(("put", "/api/admin/daily/settings/track-cooldown-pool-percent"), (MethodOf(document, "updateTrackCooldownPoolPercent"), PathOf(document, "updateTrackCooldownPoolPercent")));
        // L'historique d'un joueur inconnu : 404 documenté, avec son ProblemDetails.
        Assert.Equal("#/components/schemas/ProblemDetails", ResponseSchemaRef(document, "getPlayerHistory", "404"));
        Assert.Contains("400", Codes(document, "getDashboard"));
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
}

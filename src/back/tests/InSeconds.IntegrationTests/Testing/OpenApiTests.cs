namespace InSeconds.IntegrationTests.Testing;

/// <summary>
/// Document OpenAPI du module Players : servi par l'hôte de test seulement, pour
/// générer le client NSwag du front. Absent de l'API de prod (S9).
/// </summary>
public class OpenApiTests(PostgresFixture postgres) : OpenApiDocumentTests(postgres, "players")
{
    [Fact]
    public async Task L_hote_de_test_sert_le_document_du_module_Players()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(
            [
                "confirmEmailChange", "createGuest", "deleteMyAccount", "exportMyData", "getMe", "listDevices", "logout",
                "requestEmailChange", "requestMagicLink", "revokeDevice", "revokeOtherDevices", "updatePseudo", "verifyMagicLink",
            ],
            OperationIds(document).Order(StringComparer.Ordinal));
        // Rien d'autre que le module : ni /api/e2e, ni /api/admin, ni dev-login.
        Assert.All(document["paths"]!.AsObject().Select(p => p.Key), path => Assert.StartsWith("/api/players", path));
    }

    [Fact]
    public async Task Les_corps_de_requete_et_de_reponse_sont_types()
    {
        var document = await ReadDocumentAsync();
        var schemas = document["components"]!["schemas"]!.AsObject().Select(s => s.Key).ToHashSet();

        foreach (var name in new[]
                 {
                     "RequestMagicLink", "VerifyMagicLink", "VerifyMagicLinkResponse", "PlayerMeResponse", "GuestResponse",
                     "UpdatePseudo", "PseudoResponse", "RequestEmailChange", "ConfirmEmailChange", "EmailChangedResponse",
                     "DeviceResponse", "RevokedDevicesResponse", "ProblemDetails", "DeleteMyAccount", "PlayerDataExport",
                 })
            Assert.Contains(name, schemas);

        Assert.Equal("#/components/schemas/VerifyMagicLink", Operation(document, "verifyMagicLink")["requestBody"]!["content"]!["application/json"]!["schema"]!["$ref"]!.GetValue<string>());
        Assert.Equal("#/components/schemas/VerifyMagicLinkResponse", ResponseSchemaRef(document, "verifyMagicLink", "200"));
        Assert.Equal("#/components/schemas/GuestResponse", ResponseSchemaRef(document, "createGuest", "200"));
        Assert.Equal("array", Operation(document, "listDevices")["responses"]!["200"]!["content"]!["application/json"]!["schema"]!["type"]!.GetValue<string>());
        // « pseudo » est facultatif dans la requête (seconde étape de la connexion), un entier reste un entier.
        Assert.DoesNotContain("pseudo", document["components"]!["schemas"]!["VerifyMagicLink"]!["required"]!.AsArray().Select(r => r!.GetValue<string>()));
        Assert.Equal("integer", document["components"]!["schemas"]!["DeviceResponse"]!["properties"]!["id"]!["type"]!.GetValue<string>());
        Assert.Equal("#/components/schemas/PlayerDataExport", ResponseSchemaRef(document, "exportMyData", "200"));
        Assert.Equal("#/components/schemas/DeleteMyAccount", Operation(document, "deleteMyAccount")["requestBody"]!["content"]!["application/json"]!["schema"]!["$ref"]!.GetValue<string>());
    }

    [Fact]
    public async Task GetMe_documente_200_et_204_sans_identite()
    {
        var responses = Operation(await ReadDocumentAsync(), "getMe")["responses"]!.AsObject().Select(r => r.Key).Order(StringComparer.Ordinal);

        Assert.Equal(["200", "204"], responses);
    }

    [Fact]
    public async Task Les_erreurs_ProblemDetails_sont_documentees_sans_404_fantome()
    {
        var document = await ReadDocumentAsync();

        Assert.Contains("409", Codes(document, "updatePseudo"));
        Assert.Contains("403", Codes(document, "updatePseudo"));
        Assert.Contains("429", Codes(document, "requestMagicLink"));
        Assert.Contains("403", Codes(document, "verifyMagicLink"));
        Assert.Contains("404", Codes(document, "revokeDevice"));
        // Wolverine déclare un 404 sans schéma partout : seul un vrai 404 reste.
        Assert.DoesNotContain("404", Codes(document, "createGuest"));
        Assert.DoesNotContain("404", Codes(document, "updatePseudo"));
        Assert.Equal("#/components/schemas/ProblemDetails", ResponseSchemaRef(document, "revokeDevice", "404"));
        Assert.Null(Operation(document, "logout")["responses"]!["204"]!["content"]);
    }
}

namespace InSeconds.IntegrationTests.Testing;

/// <summary>Document OpenAPI du module Social (les groupes entre amis) : servi par l'hôte de test seulement, pour générer le client NSwag du front.</summary>
public class SocialOpenApiTests(PostgresFixture postgres) : OpenApiDocumentTests(postgres, "social")
{
    [Fact]
    public async Task L_hote_de_test_sert_le_document_du_module_Social()
    {
        var document = await ReadDocumentAsync();

        Assert.Equal(
            [
                "createGroup", "deleteGroup", "getGroup", "getGroupRanking", "getInvitation", "joinGroup", "leaveGroup", "listMyGroups", "rotateGroupInviteCode",
            ],
            OperationIds(document).Order(StringComparer.Ordinal));
        Assert.All(document["paths"]!.AsObject().Select(p => p.Key), path => Assert.StartsWith("/api/social", path, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Les_routes_sans_corps_n_en_declarent_pas_et_les_refus_sont_declares()
    {
        var document = await ReadDocumentAsync();

        foreach (var id in new[] { "listMyGroups", "getGroup", "getGroupRanking", "getInvitation", "joinGroup", "leaveGroup", "deleteGroup", "rotateGroupInviteCode" })
            Assert.Null(Operation(document, id)["requestBody"]);
        Assert.NotNull(Operation(document, "createGroup")["requestBody"]);
        foreach (var status in new[] { "400", "403", "409" })
            Assert.NotNull(Operation(document, "createGroup")["responses"]![status]);
        Assert.NotNull(Operation(document, "getGroupRanking")["responses"]!["404"]);
        Assert.NotNull(Operation(document, "joinGroup")["responses"]!["409"]);
    }
}

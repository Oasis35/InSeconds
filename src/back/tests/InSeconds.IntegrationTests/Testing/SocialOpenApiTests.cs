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
                "createGroup", "deleteAdminGroup", "deleteGroup", "getGroup", "getGroupRanking", "getInvitation", "joinGroup", "leaveGroup", "listAdminGroups",
                "listMyGroups", "renameAdminGroup", "resetAdminGroupName", "rotateGroupInviteCode",
            ],
            OperationIds(document).Order(StringComparer.Ordinal));
        Assert.All(document["paths"]!.AsObject().Select(p => p.Key), path =>
            Assert.True(path.StartsWith("/api/social", StringComparison.Ordinal) || path.StartsWith("/api/admin/social", StringComparison.Ordinal), path));
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
        foreach (var id in new[] { "deleteAdminGroup", "resetAdminGroupName", "listAdminGroups" })
            Assert.Null(Operation(document, id)["requestBody"]);
        Assert.NotNull(Operation(document, "renameAdminGroup")["requestBody"]);
        Assert.NotNull(Operation(document, "renameAdminGroup")["responses"]!["400"]);
        Assert.Null(Operation(document, "deleteAdminGroup")["responses"]!["204"]!["content"]);
    }
}

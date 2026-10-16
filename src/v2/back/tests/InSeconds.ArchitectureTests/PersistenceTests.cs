using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.ArchitectureTests;

public class PersistenceTests
{
    /// <summary>
    /// La v2 partage la base de la v1 jusqu'à la bascule : elle ne doit jamais toucher aux tables
    /// v1, qui sont toutes dans <c>public</c> (§ 12 du plan v2, premier risque).
    /// </summary>
    [Fact]
    public void AucuneEntiteV2_NEstRangeeDansPublic()
    {
        using var db = CreateContext();

        var inPublic = db.Model.GetEntityTypes()
            .Where(e => e.GetTableName() is not null)
            .Where(e => e.GetSchema() is null or "public")
            .Select(e => e.Name);

        Assert.Empty(inPublic);
    }

    [Fact]
    public void LesTablesSontEnSnakeCase()
    {
        using var db = CreateContext();

        var notSnakeCase = db.Model.GetEntityTypes()
            .SelectMany(e => e.GetProperties().Select(p => p.GetColumnName()).Append(e.GetTableName()!))
            .Where(name => name != name.ToLowerInvariant());

        Assert.Empty(notSnakeCase);
    }

    private static InSecondsDbContext CreateContext()
    {
        // Aucune connexion n'est ouverte : seul le modèle est lu.
        var options = DatabaseServiceCollectionExtensions.Configure(
            new DbContextOptionsBuilder<InSecondsDbContext>(), "Host=unused");
        return new InSecondsDbContext((DbContextOptions<InSecondsDbContext>)options.Options);
    }
}

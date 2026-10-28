using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.ArchitectureTests;

public class PersistenceTests
{
    /// <summary>
    /// Chaque entité déclare son schéma : rien ne vit dans <c>public</c>, qui reste vide (règle dure du
    /// CLAUDE.md racine).
    /// </summary>
    [Fact]
    public void AucuneEntite_NEstRangeeDansPublic()
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

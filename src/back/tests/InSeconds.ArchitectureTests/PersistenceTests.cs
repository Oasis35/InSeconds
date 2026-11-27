using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

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

    /// <summary>
    /// Chaque entité d'un module vit dans le schéma de ce module (<c>Modules/Players</c> : <c>players</c>…), jamais dans celui d'un autre. Les
    /// entités hors des modules sont techniques : <c>infra</c> seulement.
    /// </summary>
    [Fact]
    public void ChaqueEntite_EstDansLeSchemaDeSonModule()
    {
        using var db = CreateContext();

        var offenders = db.Model.GetEntityTypes()
            .Where(e => e.GetTableName() is not null)
            .Select(e => (Entity: e.Name, Schema: e.GetSchema(), Expected: ExpectedSchema(e)))
            .Where(x => x.Schema != x.Expected)
            .Select(x => $"{x.Entity} : schéma « {x.Schema} », attendu « {x.Expected} »");

        Assert.Empty(offenders);
    }

    /// <summary>
    /// Pas de navigation EF entre modules : seulement des identifiants et des clés étrangères déclarées par le nom du type (règle dure du
    /// CLAUDE.md racine). Une navigation reliait deux modules dans le modèle sans qu'aucun type n'apparaisse dans le code.
    /// </summary>
    [Fact]
    public void AucuneNavigationEF_NeTraverseUnModule()
    {
        using var db = CreateContext();

        var navigations = db.Model.GetEntityTypes()
            .SelectMany(e => e.GetNavigations().Cast<INavigationBase>().Concat(e.GetSkipNavigations()))
            .ToArray();
        // Un modèle sans aucune navigation ferait passer la règle à vide.
        Assert.NotEmpty(navigations);

        var offenders = navigations
            .Where(n => ModuleOf(n.DeclaringEntityType.ClrType) != ModuleOf(n.TargetEntityType.ClrType))
            .Select(n => $"{n.DeclaringEntityType.Name}.{n.Name} -> {n.TargetEntityType.Name}")
            .Distinct();

        Assert.Empty(offenders);
    }

    /// <summary>Des ports nommés par l'intention (<c>IPlayerStore</c>…), jamais un repository générique.</summary>
    [Fact]
    public void AucunRepositoryGenerique()
    {
        var offenders = typeof(Program).Assembly.GetTypes()
            .Where(t => t.IsGenericTypeDefinition
                        && (t.Name.StartsWith("IRepository`", StringComparison.Ordinal)
                            || t.Name.StartsWith("Repository`", StringComparison.Ordinal)
                            || t.Name.StartsWith("IGenericRepository`", StringComparison.Ordinal)))
            .Select(t => t.FullName);

        Assert.Empty(offenders);
    }

    private const string ModulesPrefix = "InSeconds.Api.Modules.";

    private static string? ModuleOf(Type type) =>
        type.FullName is { } name && name.StartsWith(ModulesPrefix, StringComparison.Ordinal)
            ? name[ModulesPrefix.Length..].Split('.')[0]
            : null;

    /// <summary>
    /// Le schéma de son module ; une table de jointure sans classe (<c>track_genres</c>) suit le module des entités qu'elle relie ; les tables de
    /// Wolverine (outbox) sont dans <c>messaging</c> ; le reste est technique (<c>infra</c>).
    /// </summary>
    private static string ExpectedSchema(IEntityType entity)
    {
        if (ModuleOf(entity.ClrType) is { } module)
            return module.ToLowerInvariant();
        if (entity.ClrType.Namespace?.StartsWith("Wolverine", StringComparison.Ordinal) == true)
            return DbSchemas.Messaging;
        if (entity.HasSharedClrType && entity.GetForeignKeys().Select(fk => ModuleOf(fk.PrincipalEntityType.ClrType)).FirstOrDefault(m => m is not null) is { } joined)
            return joined.ToLowerInvariant();
        return DbSchemas.Infra;
    }

    private static InSecondsDbContext CreateContext()
    {
        // Aucune connexion n'est ouverte : seul le modèle est lu.
        var options = DatabaseServiceCollectionExtensions.Configure(
            new DbContextOptionsBuilder<InSecondsDbContext>(), "Host=unused");
        return new InSecondsDbContext((DbContextOptions<InSecondsDbContext>)options.Options);
    }
}

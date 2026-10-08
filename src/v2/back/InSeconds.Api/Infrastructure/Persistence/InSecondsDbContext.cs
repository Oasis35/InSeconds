using InSeconds.Api.Infrastructure.Settings;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Wolverine.EntityFrameworkCore;

namespace InSeconds.Api.Infrastructure.Persistence;

/// <summary>
/// Le seul DbContext de la v2. Chaque module y apporte ses configurations
/// (<c>IEntityTypeConfiguration</c>), rangées dans son propre schéma.
/// </summary>
public sealed class InSecondsDbContext(DbContextOptions<InSecondsDbContext> options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<Setting> Settings => Set<Setting>();

    /// <summary>Clés Data Protection (chiffrement du cookie), lues et écrites par Data Protection lui-même.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    private static bool IsReferencedModule(Type configuration) =>
        configuration.Namespace is { } ns && (ns.Contains(".Modules.Players.", StringComparison.Ordinal) || ns.Contains(".Modules.Catalogue.", StringComparison.Ordinal));

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder) =>
        configurationBuilder.Conventions.Add(_ => new CitextOnlyInExtensionsSchemaConvention());

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // citext sert aux emails et aux pseudos (comparaison insensible à la casse).
        modelBuilder.HasPostgresExtension(DbSchemas.Extensions, "citext");
        // Tables de l'outbox de Wolverine dans le modèle EF : la donnée et les messages à envoyer
        // partent dans la même transaction, et les migrations EF créent ces tables (constat A1, § 12 ter).
        modelBuilder.MapWolverineEnvelopeStorage(DbSchemas.Messaging);
        var assembly = typeof(InSecondsDbContext).Assembly;
        // Les modules dont d'autres référencent les entités par leur nom de type (clés étrangères de Daily vers Players et Catalogue, que Daily ne
        // peut pas importer) d'abord : EF ne trouve une entité par son nom que si elle est déjà dans le modèle, sinon il en crée une autre à la place.
        modelBuilder.ApplyConfigurationsFromAssembly(assembly, type => IsReferencedModule(type));
        modelBuilder.ApplyConfigurationsFromAssembly(assembly, type => !IsReferencedModule(type));
    }
}

/// <summary>
/// Npgsql déclare de lui-même l'extension de chaque type utilisé par une colonne (<c>citext</c>), hors
/// de tout schéma, en plus de celle déclarée dans <c>extensions</c> : un second <c>CREATE EXTENSION</c>,
/// sans effet mais trompeur (constat B1). Ajoutée après les conventions d'Npgsql, celle-ci le retire.
/// </summary>
internal sealed class CitextOnlyInExtensionsSchemaConvention : IModelFinalizingConvention
{
    public void ProcessModelFinalizing(IConventionModelBuilder modelBuilder, IConventionContext<IConventionModelBuilder> context) =>
        modelBuilder.Metadata.RemoveAnnotation("Npgsql:PostgresExtension:citext");
}

/// <summary>Même forme que la table v1 <c>DataProtectionKeys</c>, copiée telle quelle à l'import (§ 8.2).</summary>
internal sealed class DataProtectionKeyConfiguration : IEntityTypeConfiguration<DataProtectionKey>
{
    public void Configure(EntityTypeBuilder<DataProtectionKey> builder) =>
        builder.ToTable("data_protection_keys", DbSchemas.Infra);
}

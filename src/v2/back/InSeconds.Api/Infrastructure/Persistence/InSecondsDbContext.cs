using InSeconds.Api.Infrastructure.Settings;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace InSeconds.Api.Infrastructure.Persistence;

/// <summary>
/// Le seul DbContext de la v2. Chaque module y apporte ses configurations
/// (<c>IEntityTypeConfiguration</c>), rangées dans son propre schéma.
/// </summary>
public sealed class InSecondsDbContext(DbContextOptions<InSecondsDbContext> options) : DbContext(options)
{
    public DbSet<Setting> Settings => Set<Setting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // citext servira aux emails et aux pseudos (comparaison insensible à la casse).
        modelBuilder.HasPostgresExtension(DbSchemas.Extensions, "citext");
        // Tables de l'outbox de Wolverine dans le modèle EF : la donnée et les messages à envoyer
        // partent dans la même transaction, et les migrations EF créent ces tables (constat A1, § 12 ter).
        modelBuilder.MapWolverineEnvelopeStorage(DbSchemas.Messaging);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(InSecondsDbContext).Assembly);
    }
}

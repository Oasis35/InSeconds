using InSeconds.Api.Infrastructure.Settings;
using Microsoft.EntityFrameworkCore;

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
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(InSecondsDbContext).Assembly);
    }
}

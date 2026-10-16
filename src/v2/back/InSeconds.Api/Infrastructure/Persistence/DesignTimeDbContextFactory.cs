using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace InSeconds.Api.Infrastructure.Persistence;

/// <summary>
/// Utilisée par <c>dotnet ef</c> (ajout de migration, vérification du modèle en CI) sans démarrer
/// l'application. La chaîne de connexion n'est lue que par <c>dotnet ef database update</c>.
/// </summary>
internal sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<InSecondsDbContext>
{
    public InSecondsDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=inseconds;Username=inseconds";
        var options = DatabaseServiceCollectionExtensions.Configure(
            new DbContextOptionsBuilder<InSecondsDbContext>(), connectionString);
        return new InSecondsDbContext((DbContextOptions<InSecondsDbContext>)options.Options);
    }
}

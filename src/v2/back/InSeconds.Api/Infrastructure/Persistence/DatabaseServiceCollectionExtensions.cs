using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Infrastructure.Persistence;

public static class DatabaseServiceCollectionExtensions
{
    public static IServiceCollection AddInSecondsDatabase(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<InSecondsDbContext>(options => Configure(options, connectionString));
        return services;
    }

    /// <summary>Migrations appliquées au démarrage de l'API (pas avec <c>--migrate-only</c>, qui les applique lui-même).</summary>
    public static IServiceCollection AddDatabaseMigrationOnStartup(this IServiceCollection services) =>
        services.AddHostedService<DatabaseStartupService>();

    /// <summary>Réglages communs à l'application, aux migrations et aux tests.</summary>
    public static DbContextOptionsBuilder Configure(DbContextOptionsBuilder options, string connectionString) =>
        options
            .UseNpgsql(WithExtensionsSearchPath(connectionString), npgsql =>
                npgsql.MigrationsHistoryTable(DbSchemas.MigrationsHistoryTable, DbSchemas.Infra))
            .UseSnakeCaseNamingConvention();

    /// <summary>
    /// Ajoute le schéma <c>extensions</c> au chemin de recherche. Les opérateurs de <c>citext</c>
    /// (dont <c>=</c>) y vivent : sans lui, PostgreSQL retombe sans erreur sur la comparaison
    /// du type <c>text</c>, sensible à la casse, et « Bob@x.fr » ne retrouverait plus « bob@x.fr ».
    /// </summary>
    public static string WithExtensionsSearchPath(string connectionString)
    {
        var builder = new NpgsqlConnectionStringBuilder(connectionString);
        var schemas = (builder.SearchPath ?? "\"$user\", public")
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .ToList();
        if (!schemas.Contains(DbSchemas.Extensions))
            schemas.Add(DbSchemas.Extensions);
        builder.SearchPath = string.Join(", ", schemas);
        return builder.ConnectionString;
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
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

    /// <summary>
    /// Réglages communs à l'application, aux migrations et aux tests.
    /// <para>
    /// Une écriture refusée par la base (ex. pseudo pris au même instant par deux joueurs) est
    /// journalisée par EF Core en <c>Warning</c> au lieu d'<c>Error</c> : l'exception remonte quand même,
    /// et c'est son traitement qui décide. Un conflit attendu devient un 409
    /// (<c>AccountConflictExceptionHandler</c>) sans ligne rouge dans Grafana ; une vraie panne finit en
    /// 500, journalisée en <c>Error</c> avec son <c>traceId</c> par le gestionnaire d'erreurs global.
    /// </para>
    /// </summary>
    public static DbContextOptionsBuilder Configure(DbContextOptionsBuilder options, string connectionString) =>
        options
            .UseNpgsql(WithExtensionsSearchPath(connectionString), npgsql =>
                npgsql.MigrationsHistoryTable(DbSchemas.MigrationsHistoryTable, DbSchemas.Infra))
            .UseSnakeCaseNamingConvention()
            .ConfigureWarnings(warnings => warnings.Log(
                (CoreEventId.SaveChangesFailed, LogLevel.Warning),
                (RelationalEventId.CommandError, LogLevel.Warning)));

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

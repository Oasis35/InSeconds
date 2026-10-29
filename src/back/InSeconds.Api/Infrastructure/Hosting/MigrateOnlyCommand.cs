using InSeconds.Api.Infrastructure.Persistence;

namespace InSeconds.Api.Infrastructure.Hosting;

/// <summary>
/// <c>dotnet InSeconds.Api.dll --migrate-only</c> : applique les migrations puis s'arrête. Rien
/// d'autre ne démarre (ni serveur HTTP, ni tâches planifiées, ni traitement de messages) : le
/// déploiement s'en sert pour migrer la base avant de remplacer les conteneurs (<c>deploy/vps/deploy.sh</c>).
/// </summary>
public static class MigrateOnlyCommand
{
    public const string Flag = "--migrate-only";

    public static bool IsRequested(string[] args) => args.Contains(Flag, StringComparer.Ordinal);

    public static async Task<int> RunAsync(string[] args, CancellationToken cancellationToken = default)
    {
        var builder = Host.CreateApplicationBuilder(args.Where(a => a != Flag).ToArray());
        var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection manquante.");

        // Uniquement la base : le host n'est jamais démarré, aucun service hébergé ne tourne.
        builder.Services.AddInSecondsDatabase(connectionString);
        using var host = builder.Build();

        var logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(MigrateOnlyCommand));
        logger.LogInformation("Application des migrations (--migrate-only)");
        await DatabaseMigrator.MigrateAsync(host.Services, cancellationToken);
        logger.LogInformation("Migrations appliquées, arrêt");
        return 0;
    }
}

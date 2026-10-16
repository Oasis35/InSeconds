using InSeconds.Api.Infrastructure.Settings;

namespace InSeconds.Api.Infrastructure.Persistence;

/// <summary>
/// Applique les migrations au démarrage de l'hôte, avant tout autre service hébergé (Wolverine,
/// Hangfire) : <see cref="StartingAsync"/> passe avant le <c>StartAsync</c> de tous les services.
/// Ne tourne pas quand l'hôte n'est pas démarré (<c>codegen write</c> de Wolverine, par exemple).
/// Désactivé par <c>Database:MigrateOnStartup=false</c>.
/// </summary>
internal sealed class DatabaseStartupService(IServiceProvider services, IConfiguration configuration)
    : IHostedLifecycleService
{
    public async Task StartingAsync(CancellationToken cancellationToken)
    {
        if (!configuration.GetValue("Database:MigrateOnStartup", defaultValue: true))
            return;

        await DatabaseMigrator.MigrateAsync(services, cancellationToken);
        // La table infra.settings peut ne pas avoir existé à la construction de la configuration.
        services.GetRequiredService<ISettingsReloader>().Reload();
    }

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StartedAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StoppingAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StoppedAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

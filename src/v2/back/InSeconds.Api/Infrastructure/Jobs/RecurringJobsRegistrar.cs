using Hangfire;
using Hangfire.Storage;

namespace InSeconds.Api.Infrastructure.Jobs;

/// <summary>
/// Au démarrage, enregistre chaque tâche déclarée avec son cron et retire de Hangfire celles qui
/// ne le sont plus (tâche renommée ou supprimée), pour que le tableau de bord reflète le code.
/// </summary>
internal sealed class RecurringJobsRegistrar(
    IEnumerable<ScheduledJobDefinition> definitions,
    IRecurringJobManager manager,
    JobStorage storage,
    IConfiguration configuration,
    ILogger<RecurringJobsRegistrar> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        var declared = definitions.ToList();
        foreach (var definition in declared)
        {
            var cron = definition.CronFrom(configuration);
            definition.Register(manager, cron);
            logger.LogInformation("Tâche planifiée {JobId} : {Cron}", definition.Id, cron);
        }

        using var connection = storage.GetConnection();
        var stale = connection.GetRecurringJobs()
            .Select(job => job.Id)
            .Where(id => declared.TrueForAll(definition => definition.Id != id));
        foreach (var id in stale)
        {
            manager.RemoveIfExists(id);
            logger.LogInformation("Tâche planifiée {JobId} retirée (plus déclarée)", id);
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

using Hangfire;

namespace InSeconds.Api.Infrastructure.Jobs;

/// <summary>
/// Une tâche planifiée : une classe d'une ligne qui appelle une commande Wolverine
/// (<c>bus.InvokeAsync(new GenerateDailyChallenge(), ct)</c>). La logique reste dans le module ;
/// Hangfire ne décide que du moment (§ 5.4 bis du plan v2). La valeur renvoyée est le compte rendu
/// de l'exécution, conservé par Hangfire et lu par <c>GET /api/admin/jobs/last-runs</c>.
/// Poser <c>[DisableConcurrentExecution]</c> et <c>[AutomaticRetry]</c> sur chaque tâche.
/// </summary>
public interface IScheduledJob
{
    Task<object?> RunAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Échec métier attendu d'une tâche (ex. <c>daily.pool_insufficient</c>). Le message est le code
/// d'erreur, renvoyé tel quel par <c>GET /api/admin/jobs/last-runs</c> ; toute autre exception y apparaît
/// comme <c>common.unexpected</c>, sans détail.
/// </summary>
public sealed class JobFailedException(string code) : Exception(code)
{
    public string Code => Message;
}

/// <summary>Tâche récurrente déclarée par un module (<see cref="ScheduledJobsServiceCollectionExtensions.AddScheduledJob{TJob}"/>).</summary>
public sealed record ScheduledJobDefinition(
    string Id, string DefaultCron, Type JobType, Action<IRecurringJobManager, string> Register)
{
    /// <summary>Cron effectif : <c>Jobs:&lt;id&gt;:Cron</c> s'il est configuré, sinon le cron par défaut.</summary>
    public string CronFrom(IConfiguration configuration) => configuration[$"Jobs:{Id}:Cron"] ?? DefaultCron;
}

public static class ScheduledJobsServiceCollectionExtensions
{
    /// <summary>
    /// Déclare une tâche récurrente, en UTC. Son cron se change par la configuration
    /// (<c>Jobs:&lt;id&gt;:Cron</c>) ; <c>Cron.Never()</c> la met en pause.
    /// </summary>
    public static IServiceCollection AddScheduledJob<TJob>(this IServiceCollection services, string id, string defaultCron)
        where TJob : class, IScheduledJob
    {
        services.AddScoped<TJob>();
        services.AddSingleton(new ScheduledJobDefinition(id, defaultCron, typeof(TJob),
            (manager, cron) => manager.AddOrUpdate<TJob>(
                id, job => job.RunAsync(CancellationToken.None), cron,
                new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc })));
        return services;
    }
}

using Hangfire.Server;

namespace InSeconds.Api.Infrastructure.Jobs;

/// <summary>
/// Après chaque exécution d'une tâche récurrente (planifiée ou lancée depuis <c>/jobs</c>), envoie son signal à
/// healthchecks.io (<see cref="JobHeartbeat"/>). Un échec suivi d'un nouvel essai envoie aussi <c>/fail</c> : l'alerte
/// part tout de suite, et le signal de réussite de l'essai suivant la referme. Posé sur le serveur Hangfire seulement
/// (<see cref="JobsSetup"/>), pas dans la liste globale des filtres : il dépend des services de l'API.
/// </summary>
public sealed class JobHeartbeatFilter(IServiceProvider services) : IServerFilter
{
    /// <summary>Paramètre posé par Hangfire sur une exécution issue d'une tâche récurrente.</summary>
    private const string RecurringJobIdParameter = "RecurringJobId";

    public void OnPerforming(PerformingContext context)
    {
    }

    public void OnPerformed(PerformedContext context)
    {
        // Arrêt du serveur : la tâche sera relancée, ce n'est ni une réussite ni un échec.
        if (context.Canceled)
            return;

        var jobId = context.GetJobParameter<string>(RecurringJobIdParameter);
        if (string.IsNullOrEmpty(jobId))
            return;

        // Résolu à chaque passage : un client HTTP gardé par ce filtre (singleton) ne renouvellerait jamais sa connexion.
        // Les filtres de Hangfire sont synchrones ; le signal est court et borné par le délai du client HTTP.
        services.GetRequiredService<JobHeartbeat>().SignalAsync(jobId, succeeded: context.Exception is null, CancellationToken.None)
            .GetAwaiter().GetResult();
    }
}

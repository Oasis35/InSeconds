using System.Reflection;
using Hangfire;
using Hangfire.States;
using Hangfire.Storage;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Infrastructure.Jobs;

/// <summary>Le corps de la réponse 202 d'un bouton qui lance une tâche : l'exécution à suivre par <c>GET /api/admin/jobs/{id}</c>.</summary>
public sealed record JobExecutionResponse(string Id) : IHttpAware
{
    /// <summary>202 et l'adresse de l'exécution : l'endpoint renvoie ce corps tel quel.</summary>
    void IHttpAware.Apply(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status202Accepted;
        context.Response.Headers.Location = $"/api/admin/jobs/{Id}";
    }

    public static void PopulateMetadata(MethodInfo method, EndpointBuilder builder)
    {
        builder.RemoveStatusCodeResponse(StatusCodes.Status200OK);
        builder.Metadata.Add(new ProducesResponseTypeAttribute(typeof(JobExecutionResponse), StatusCodes.Status202Accepted));
    }
}

/// <summary>
/// Lance une tâche récurrente à la demande (§ 5.4 bis du plan v2 : les boutons « Re-vérifier les previews » et
/// « Générer le défi du jour » passent par Hangfire, pour que chaque lancement apparaisse dans l'historique
/// de <c>/jobs</c>).
/// </summary>
public interface IJobTrigger
{
    /// <summary>
    /// Déclenche la tâche et renvoie l'identifiant de son exécution. Si une exécution est déjà **en file ou en cours**,
    /// c'est son identifiant qui est renvoyé, sans en lancer une seconde (au mieux : la vérification et le déclenchement ne
    /// sont pas atomiques, deux clics simultanés peuvent lancer deux exécutions, que <c>[DisableConcurrentExecution]</c> de la
    /// tâche sérialise). Une exécution en attente d'un nouvel essai après un échec n'est pas reconnue comme en cours.
    /// </summary>
    Task<string> TriggerAsync(string jobId, CancellationToken ct);
}

internal sealed class HangfireJobTrigger(JobStorage storage, IRecurringJobManagerV2 manager) : IJobTrigger
{
    public Task<string> TriggerAsync(string jobId, CancellationToken ct)
    {
        using (var connection = storage.GetConnection())
        {
            var running = connection.GetRecurringJobs().FirstOrDefault(job => job.Id == jobId);
            if (running?.LastJobId is { } lastJobId
                && (running.LastJobState == EnqueuedState.StateName || running.LastJobState == ProcessingState.StateName))
                return Task.FromResult(lastJobId);
        }

        var executionId = manager.TriggerJob(jobId)
            ?? throw new InvalidOperationException($"La tâche {jobId} n'est pas déclarée (AddScheduledJob).");
        return Task.FromResult(executionId);
    }
}

using System.Text.Json;
using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using Hangfire.Storage;
using Hangfire.Storage.Monitoring;
using InSeconds.Api.Infrastructure.Errors;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Infrastructure.Jobs;

/// <summary>
/// Dernier passage d'une tâche récurrente, affiché en témoin dans l'onglet Actions de l'admin (§ 5.4 bis du plan v2).
/// Lu dans Hangfire, qui garde le détail d'une exécution 7 jours (<see cref="JobsSetup.ExecutionRetention"/>).
/// </summary>
/// <param name="Id">Identifiant de la tâche (<c>daily-generate-challenge</c>, <c>catalogue-refresh</c>…).</param>
/// <param name="State">
/// <c>queued</c>, <c>processing</c>, <c>succeeded</c>, <c>failed</c>, <c>retry_scheduled</c> ou <c>deleted</c> ;
/// absent si la tâche n'a jamais tourné ou si sa dernière exécution a plus de 7 jours.
/// </param>
/// <param name="At">Heure du dernier changement d'état : fin de l'exécution, ou dernier essai en échec si un nouvel essai est prévu.</param>
/// <param name="Result">Compte rendu renvoyé par la tâche, si elle a réussi.</param>
/// <param name="ErrorCode">Code de la dernière erreur (<see cref="JobFailedException"/>), jamais le message ni la pile.</param>
/// <param name="RetryAt">Heure du prochain essai, si la tâche a échoué et sera relancée.</param>
/// <param name="NextRunAt">Prochain passage planifié (absent si la tâche est en pause).</param>
public sealed record JobLastRun(
    string Id, string? State, DateTimeOffset? At, JsonElement? Result, string? ErrorCode,
    DateTimeOffset? RetryAt, DateTimeOffset? NextRunAt);

public static class GetJobLastRunsEndpoint
{
    /// <summary><c>GET /api/admin/jobs/last-runs</c> : le dernier passage de chaque tâche récurrente, par identifiant.</summary>
    [WolverineGet("/api/admin/jobs/last-runs", OperationId = "getJobLastRuns")]
    [ProducesResponseType<JobLastRun[]>(StatusCodes.Status200OK)]
    public static JobLastRun[] Get(JobStorage storage)
    {
        List<RecurringJobDto> recurring;
        using (var connection = storage.GetConnection())
            recurring = connection.GetRecurringJobs();

        var monitoring = storage.GetMonitoringApi();
        return recurring
            .OrderBy(job => job.Id, StringComparer.Ordinal)
            .Select(job => ToLastRun(job, job.LastJobId is { } jobId ? monitoring.JobDetails(jobId) : null))
            .ToArray();
    }

    private static JobLastRun ToLastRun(RecurringJobDto job, JobDetailsDto? details)
    {
        DateTimeOffset? next = job.NextExecution is { } nextExecution ? AsUtc(nextExecution) : null;
        // Exécution expirée (plus de 7 jours) ou jamais lancée : rien d'autre à dire que le prochain passage.
        if (details is null || details.History.Count == 0)
            return new JobLastRun(job.Id, null, null, null, null, null, next);

        // Historique du plus récent au plus ancien.
        var current = details.History[0];
        var lastFailure = details.History.FirstOrDefault(h => h.StateName == FailedState.StateName);
        var state = ToState(current.StateName, retried: lastFailure is not null);

        JsonElement? result = null;
        if (current.StateName == SucceededState.StateName
            && current.Data.TryGetValue("Result", out var json) && !string.IsNullOrEmpty(json))
        {
            using var document = JsonDocument.Parse(json);
            result = document.RootElement.Clone();
        }

        string? errorCode = null;
        DateTimeOffset? retryAt = null;
        var at = AsUtc(current.CreatedAt);
        if (lastFailure is not null && state is "failed" or "retry_scheduled")
        {
            errorCode = lastFailure.Data.TryGetValue("ExceptionType", out var type)
                && type == typeof(JobFailedException).FullName
                && lastFailure.Data.TryGetValue("ExceptionMessage", out var code)
                    ? code
                    : ErrorCodes.Unexpected;
            at = AsUtc(lastFailure.CreatedAt);
        }

        if (state == "retry_scheduled"
            && current.Data.TryGetValue("EnqueueAt", out var enqueueAt)
            && JobHelper.DeserializeNullableDateTime(enqueueAt) is { } retry)
            retryAt = AsUtc(retry);

        return new JobLastRun(job.Id, state, at, result, errorCode, retryAt, next);
    }

    private static string ToState(string hangfireState, bool retried)
    {
        if (hangfireState == EnqueuedState.StateName || hangfireState == AwaitingState.StateName)
            return "queued";
        if (hangfireState == ScheduledState.StateName)
            return retried ? "retry_scheduled" : "queued";
        if (hangfireState == ProcessingState.StateName)
            return "processing";
        if (hangfireState == SucceededState.StateName)
            return "succeeded";
        if (hangfireState == FailedState.StateName)
            return "failed";
        if (hangfireState == DeletedState.StateName)
            return "deleted";
        return hangfireState.ToLowerInvariant();
    }

    // Hangfire rend des dates UTC sans le préciser (Kind = Unspecified).
    private static DateTimeOffset AsUtc(DateTime value) => new(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}

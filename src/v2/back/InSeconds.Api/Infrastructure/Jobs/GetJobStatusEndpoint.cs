using System.Text.Json;
using Hangfire;
using Hangfire.States;
using InSeconds.Api.Infrastructure.Errors;
using Wolverine.Http;

namespace InSeconds.Api.Infrastructure.Jobs;

/// <summary>
/// État et compte rendu d'une exécution de tâche, interrogés par l'admin après un clic sur
/// « Générer le défi du jour » ou « Re-vérifier les previews » (§ 5.4 bis du plan v2).
/// </summary>
/// <param name="State"><c>queued</c>, <c>processing</c>, <c>succeeded</c>, <c>failed</c>, <c>retry_scheduled</c> ou <c>deleted</c>.</param>
/// <param name="Result">Valeur renvoyée par la tâche, si elle a réussi.</param>
/// <param name="ErrorCode">Code de la dernière erreur (<see cref="JobFailedException"/>), jamais le message ni la pile.</param>
public sealed record JobStatusResponse(string Id, string State, JsonElement? Result, string? ErrorCode);

public static class GetJobStatusEndpoint
{
    [WolverineGet("/api/admin/jobs/{id}")]
    public static IResult Get(string id, JobStorage storage)
    {
        // Les identifiants de Hangfire.PostgreSql sont des entiers : tout le reste est inconnu.
        if (!long.TryParse(id, out _))
            return NotFound();

        var details = storage.GetMonitoringApi().JobDetails(id);
        if (details is null || details.History.Count == 0)
            return NotFound();

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
        if (lastFailure is not null && state is "failed" or "retry_scheduled")
        {
            errorCode = lastFailure.Data.TryGetValue("ExceptionType", out var type)
                && type == typeof(JobFailedException).FullName
                && lastFailure.Data.TryGetValue("ExceptionMessage", out var code)
                    ? code
                    : ErrorCodes.Unexpected;
        }

        return Results.Ok(new JobStatusResponse(id, state, result, errorCode));
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

    private static IResult NotFound() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound,
            extensions: new Dictionary<string, object?> { ["code"] = ErrorCodes.NotFound });
}

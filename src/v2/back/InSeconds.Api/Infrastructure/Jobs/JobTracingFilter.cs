using System.Diagnostics;
using Hangfire.Server;
using InSeconds.Infrastructure.Observability;

namespace InSeconds.Api.Infrastructure.Jobs;

/// <summary>
/// Une trace par exécution de tâche Hangfire : les requêtes SQL et les messages Wolverine lancés par
/// la tâche s'y rattachent, et un échec reste lisible dans Grafana comme une requête HTTP.
/// </summary>
public sealed class JobTracingFilter : IServerFilter
{
    private const string ActivityKey = "InSeconds.Activity";

    public void OnPerforming(PerformingContext context)
    {
        var activity = TelemetrySources.JobsSource.StartActivity(
            $"job {context.BackgroundJob.Job.Type.Name}.{context.BackgroundJob.Job.Method.Name}", ActivityKind.Internal);
        if (activity is null)
            return;

        activity.SetTag("inseconds.job_id", context.BackgroundJob.Id);
        context.Items[ActivityKey] = activity;
    }

    public void OnPerformed(PerformedContext context)
    {
        if (!context.Items.TryGetValue(ActivityKey, out var item) || item is not Activity activity)
            return;

        if (context.Exception is not null)
            activity.SetStatus(ActivityStatusCode.Error, context.Exception.GetType().Name);
        activity.Dispose();
    }
}

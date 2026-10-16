using System.Diagnostics;

namespace InSeconds.Infrastructure.Observability;

/// <summary>Sources d'activité propres à InSeconds, déclarées à OpenTelemetry.</summary>
public static class TelemetrySources
{
    /// <summary>Une activité par exécution de tâche planifiée (Hangfire).</summary>
    public const string Jobs = "InSeconds.Jobs";

    public static readonly ActivitySource JobsSource = new(Jobs);
}

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace InSeconds.Infrastructure.Observability;

/// <summary>
/// Logs, traces et métriques en OpenTelemetry standard (OTLP), comme en v1. L'outil qui reçoit les
/// données n'est jamais nommé dans le code : il se choisit par les variables
/// <c>OTEL_EXPORTER_OTLP_*</c>. Sans <c>OTEL_EXPORTER_OTLP_ENDPOINT</c>, rien n'est exporté (dev,
/// CI, tests), mais l'instrumentation tourne quand même pour que le <c>traceId</c> existe partout.
/// Confidentialité : ni en-têtes (cookie, <c>Authorization</c>), ni email, ni pseudo, ni réponse saisie.
/// </summary>
public static class ObservabilityExtensions
{
    public const string ServiceName = "inseconds-api";
    public const string OtlpEndpointKey = "OTEL_EXPORTER_OTLP_ENDPOINT";

    /// <summary>Sources d'activité suivies en plus de l'instrumentation standard.</summary>
    public static readonly string[] TracedSources = ["Wolverine", TelemetrySources.Jobs];

    public static WebApplicationBuilder AddInSecondsObservability(this WebApplicationBuilder builder, string serviceVersion)
    {
        var otel = builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource
                .AddService(ServiceName, serviceVersion: serviceVersion)
                .AddAttributes([new("deployment.environment.name", builder.Environment.EnvironmentName)]))
            .WithTracing(tracing => tracing
                // Pas d'enrichissement ni de capture d'en-têtes : ni cookie ni Authorization ne partent.
                .AddAspNetCoreInstrumentation(options => options.Filter = IsTracedRequest)
                .AddHttpClientInstrumentation()
                .AddNpgsql()
                .AddSource(TracedSources))
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation());

        builder.Logging.AddOpenTelemetry(options =>
        {
            // Les scopes porteront le PlayerId : indispensables pour suivre un joueur.
            options.IncludeScopes = true;
            options.IncludeFormattedMessage = true;
        });

        if (!string.IsNullOrWhiteSpace(builder.Configuration[OtlpEndpointKey]))
            otel.UseOtlpExporter();

        return builder;
    }

    /// <summary>
    /// Ni le polling <c>/health</c> du front (toutes les 5 s, par visiteur), ni celui du tableau de
    /// bord <c>/jobs</c> : ils noieraient les traces utiles.
    /// </summary>
    internal static bool IsTracedRequest(HttpContext httpContext) =>
        !httpContext.Request.Path.StartsWithSegments("/health")
        && !httpContext.Request.Path.StartsWithSegments("/jobs");
}

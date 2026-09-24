using System.Diagnostics;
using Npgsql;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace InSeconds.Api.Common.Observability;

// Logs, traces et métriques en OpenTelemetry standard (OTLP). L'outil qui reçoit les données
// (Seq, Grafana, OpenObserve…) n'est jamais nommé dans le code : il se choisit uniquement par
// les variables d'environnement OTEL_EXPORTER_OTLP_* (cf. docker-compose.prod.yml,
// .env.prod.example). Sans OTEL_EXPORTER_OTLP_ENDPOINT, rien n'est exporté (dev, CI, tests) —
// l'instrumentation tourne quand même, pour que TraceId existe partout (code d'erreur renvoyé
// par le gestionnaire d'erreurs global, scopes de logs console).
public static class ObservabilityExtensions
{
    public const string ServiceName = "inseconds-api";
    public const string OtlpEndpointKey = "OTEL_EXPORTER_OTLP_ENDPOINT";

    public static WebApplicationBuilder AddInSecondsObservability(this WebApplicationBuilder builder, string serviceVersion)
    {
        var otel = builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource
                .AddService(ServiceName, serviceVersion: serviceVersion)
                .AddAttributes([new("deployment.environment.name", builder.Environment.EnvironmentName)]))
            .WithTracing(tracing => tracing
                // Pas d'option EnrichWithHttpRequest ni de capture d'en-têtes : ni cookie
                // authToken, ni Authorization ne doivent partir (cf. test d'intégration
                // TelemetryPrivacyTests).
                .AddAspNetCoreInstrumentation(options => options.Filter = IsTracedRequest)
                .AddHttpClientInstrumentation()
                .AddNpgsql()
                .AddSource("Wolverine"))
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation());

        builder.Logging.AddOpenTelemetry(options =>
        {
            // Les scopes portent PlayerId (PlayerTelemetryMiddleware) : indispensables pour
            // filtrer la chronologie d'un joueur.
            options.IncludeScopes = true;
            options.IncludeFormattedMessage = true;
        });

        if (!string.IsNullOrWhiteSpace(builder.Configuration[OtlpEndpointKey]))
            otel.UseOtlpExporter();

        return builder;
    }

    // Le polling /health du front (toutes les 5 s, par visiteur) noierait les traces utiles.
    internal static bool IsTracedRequest(HttpContext httpContext) =>
        !httpContext.Request.Path.StartsWithSegments("/health");

    // Code d'erreur court montré au joueur et recherchable tel quel dans l'outil d'observabilité.
    public static string CurrentTraceId(HttpContext httpContext) =>
        Activity.Current?.TraceId.ToHexString() ?? httpContext.TraceIdentifier;
}

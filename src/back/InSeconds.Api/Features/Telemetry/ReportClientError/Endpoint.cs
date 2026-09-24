using Wolverine;

namespace InSeconds.Api.Features.Telemetry.ReportClientError;

public static class ReportClientErrorEndpoint
{
    public const string RateLimiterPolicy = "client-error-report";

    // Public (un visiteur sans cookie peut aussi planter) et hors OpenAPI : appelé par
    // ErrorReportingService via HttpClient, pas par l'ApiClient NSwag — une page en erreur ne
    // doit pas dépendre du client généré. Rate limiting désactivé en Testing, comme les autres.
    public static IEndpointRouteBuilder MapReportClientError(this IEndpointRouteBuilder routes, bool enableRateLimiting = true)
    {
        var route = routes.MapPost("/api/client-errors", async (
            ReportClientErrorCommand command,
            IMessageBus bus,
            CancellationToken ct) => await bus.InvokeAsync<IResult>(command, ct))
        .ExcludeFromDescription();

        if (enableRateLimiting)
            route.RequireRateLimiting(RateLimiterPolicy);

        return routes;
    }
}

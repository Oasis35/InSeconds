namespace InSeconds.Api.Features.Telemetry.ReportClientError;

// Erreur remontée par le front (ErrorReportingService) : Source = "js" (exception JavaScript non
// gérée) ou "http" (appel API en échec réseau ou 5xx). RelatedTraceId = code d'erreur renvoyé
// par l'API dans le ProblemDetails, quand il existe, pour relier les deux côtés.
public sealed record ReportClientErrorCommand(
    string Source,
    string Message,
    string? Stack,
    string? Url,
    int? HttpStatus,
    string? RelatedTraceId);

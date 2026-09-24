using InSeconds.Api.Common.Observability;

namespace InSeconds.Api.Features.Telemetry.ReportClientError;

// Loguée en Error : c'est ce qui la fait remonter dans les alertes, au même titre qu'une
// exception back. PlayerId vient du scope posé par PlayerTelemetryMiddleware.
public sealed class ReportClientErrorHandler(ILogger<ReportClientErrorHandler> logger)
{
    // Séparateur des lignes de la stack une fois aplatie.
    internal const string LineSeparator = " | ";

    public IResult Handle(ReportClientErrorCommand command)
    {
        // Tous les champs viennent du navigateur : retours à la ligne neutralisés pour qu'un
        // client ne puisse pas forger de fausses lignes dans les logs texte (injection de logs).
        PlayerActionLog.ClientError(logger,
            ToSingleLine(command.Source, " ")!,
            ToSingleLine(command.Url, " "),
            ToSingleLine(command.Message, " ")!,
            command.HttpStatus,
            ToSingleLine(command.RelatedTraceId, " "),
            ToSingleLine(command.Stack, LineSeparator));

        return Results.NoContent();
    }

    internal static string? ToSingleLine(string? value, string separator)
        => value?.Replace("\r\n", separator).Replace("\r", separator).Replace("\n", separator);
}

using InSeconds.Api.Common.Observability;

namespace InSeconds.Api.Features.Telemetry.ReportClientError;

// Loguée en Error : c'est ce qui la fait remonter dans les alertes, au même titre qu'une
// exception back. PlayerId vient du scope posé par PlayerTelemetryMiddleware.
public sealed class ReportClientErrorHandler(ILogger<ReportClientErrorHandler> logger)
{
    public IResult Handle(ReportClientErrorCommand command)
    {
        PlayerActionLog.ClientError(logger, command.Source, command.Url, command.Message,
            command.HttpStatus, command.RelatedTraceId, command.Stack);

        return Results.NoContent();
    }
}

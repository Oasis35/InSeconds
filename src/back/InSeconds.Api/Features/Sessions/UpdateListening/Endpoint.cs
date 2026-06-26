using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Sessions.UpdateListening;

public static class UpdateListeningEndpoint
{
    public static IEndpointRouteBuilder MapUpdateListening(this IEndpointRouteBuilder routes)
    {
        routes.MapPatch("/api/sessions/{sessionId:int}/listening", async (
            int sessionId,
            UpdateListeningRequest body,
            HttpContext httpContext,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            var playerId = httpContext.GetPlayerId();
            var command  = new UpdateListeningCommand(playerId, sessionId, body.TrackId, body.ListenedSeconds);
            return await bus.InvokeAsync<IResult>(command, ct);
        })
        .WithName("UpdateListening")
        .WithTags("Sessions")
        .Produces(StatusCodes.Status204NoContent)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound);

        return routes;
    }
}

public sealed record UpdateListeningRequest(int TrackId, decimal ListenedSeconds);

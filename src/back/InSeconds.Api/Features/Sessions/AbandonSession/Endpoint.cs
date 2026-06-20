using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Sessions.AbandonSession;

public static class AbandonSessionEndpoint
{
    public static IEndpointRouteBuilder MapAbandonSession(this IEndpointRouteBuilder routes)
    {
        routes.MapPut("/api/sessions/{sessionId:int}/abandon", async (
            int sessionId,
            HttpContext httpContext,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            var playerId = httpContext.GetPlayerId();
            var command  = new AbandonSessionCommand(playerId, sessionId);
            return await bus.InvokeAsync<IResult>(command, ct);
        })
        .WithName("AbandonSession")
        .WithTags("Sessions")
        .Produces(StatusCodes.Status204NoContent)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound);

        return routes;
    }
}

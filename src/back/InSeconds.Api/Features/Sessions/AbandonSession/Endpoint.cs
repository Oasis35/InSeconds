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
            // Pas de Player résolu = visiteur n'ayant jamais démarré de partie : aucune
            // session ne peut lui appartenir.
            var playerId = httpContext.GetPlayerIdOrNull();
            if (playerId is null)
                return Results.NotFound();

            var command = new AbandonSessionCommand(playerId.Value, sessionId);
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

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
            // Pas de Player résolu = visiteur n'ayant jamais démarré de partie : aucune
            // session ne peut lui appartenir.
            var playerId = httpContext.GetPlayerIdOrNull();
            if (playerId is null)
                return Results.NotFound();

            var command = new UpdateListeningCommand(playerId.Value, sessionId, body.TrackId, body.ListenedSeconds);
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

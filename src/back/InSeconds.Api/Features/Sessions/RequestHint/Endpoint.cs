using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Sessions.RequestHint;

public static class RequestHintEndpoint
{
    public static IEndpointRouteBuilder MapRequestHint(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/sessions/{sessionId:int}/hint", async (
            int sessionId,
            RequestHintBody body,
            HttpContext httpContext,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            // Pas de Player résolu = visiteur n'ayant jamais démarré de partie : aucune
            // session ne peut lui appartenir.
            var playerId = httpContext.GetPlayerIdOrNull();
            if (playerId is null)
                return Results.NotFound();

            var command = new RequestHintCommand(playerId.Value, sessionId, body.DailyChallengeTrackId, body.Level);
            return await bus.InvokeAsync<IResult>(command, ct);
        })
        .WithName("RequestHint")
        .WithTags("Sessions")
        .Produces<RequestHintResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound);

        return routes;
    }
}

public sealed record RequestHintBody(int DailyChallengeTrackId, int Level);

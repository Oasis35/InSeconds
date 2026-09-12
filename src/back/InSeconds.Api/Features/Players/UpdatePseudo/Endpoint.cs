using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Players.UpdatePseudo;

public static class UpdatePseudoEndpoint
{
    public static IEndpointRouteBuilder MapUpdatePseudo(this IEndpointRouteBuilder routes)
    {
        routes.MapPut("/api/players/me/pseudo", async (
            UpdatePseudoBody body,
            HttpContext httpContext,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            // Pas de Player résolu = visiteur guest anonyme : rien à renommer.
            var playerId = httpContext.GetPlayerIdOrNull();
            if (playerId is null)
                return Results.StatusCode(403);

            var command = new UpdatePseudoCommand(playerId.Value, body.Pseudo);
            return await bus.InvokeAsync<IResult>(command, ct);
        })
        .WithName("UpdatePseudo")
        .WithTags("Players")
        .Produces<UpdatePseudoResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound)
        .Produces(StatusCodes.Status409Conflict);

        return routes;
    }
}

public sealed record UpdatePseudoBody(string Pseudo);

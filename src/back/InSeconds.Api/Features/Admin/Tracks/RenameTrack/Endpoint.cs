using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Admin.Tracks.RenameTrack;

public static class RenameTrackEndpoint
{
    public static IEndpointRouteBuilder MapRenameTrack(this IEndpointRouteBuilder routes)
    {
        routes.MapPatch("/api/admin/tracks/{id:int}", async (
            int id,
            RenameTrackBody body,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new RenameTrackCommand(id, body.Artist, body.Title), ct);
        })
        .WithName("RenameTrack")
        .WithTags("Admin")
        .Produces<RenameTrackResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status404NotFound)
        .Produces(StatusCodes.Status409Conflict);

        return routes;
    }
}

public sealed record RenameTrackBody(string Artist, string Title);

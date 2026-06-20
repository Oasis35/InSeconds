using InSeconds.Api.Features.Admin.Login;
using Wolverine;

namespace InSeconds.Api.Features.Admin.Tracks.DeleteTrack;

public static class DeleteTrackEndpoint
{
    public static IEndpointRouteBuilder MapDeleteTrack(this IEndpointRouteBuilder routes)
    {
        routes.MapDelete("/api/admin/tracks/{id:int}", async (
            int id,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new DeleteTrackCommand(id), ct);
        })
        .WithName("DeleteTrack")
        .WithTags("Admin")
        .Produces(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status404NotFound)
        .Produces(StatusCodes.Status409Conflict);

        return routes;
    }
}

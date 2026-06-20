using InSeconds.Api.Features.Admin.Login;
using Wolverine;

namespace InSeconds.Api.Features.Admin.Tracks.UpdateTrack;

public static class UpdateTrackEndpoint
{
    public static IEndpointRouteBuilder MapUpdateTrack(this IEndpointRouteBuilder routes)
    {
        routes.MapPut("/api/admin/tracks/{id:int}", async (
            int id,
            UpdateTrackBody body,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new UpdateTrackCommand(id, body.DeezerTrackId), ct);
        })
        .WithName("UpdateTrack")
        .WithTags("Admin")
        .Produces<UpdateTrackResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status404NotFound)
        .Produces(StatusCodes.Status409Conflict)
        .Produces(StatusCodes.Status422UnprocessableEntity);

        return routes;
    }
}

public sealed record UpdateTrackBody(long DeezerTrackId);

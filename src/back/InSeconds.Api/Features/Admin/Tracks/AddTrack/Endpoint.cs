using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Admin.Tracks.AddTrack;

public static class AddTrackEndpoint
{
    public static IEndpointRouteBuilder MapAddTrack(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/api/admin/tracks", async (
            AddTrackBody body,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new AddTrackCommand(body.DeezerTrackId), ct);
        })
        .WithName("AddTrack")
        .WithTags("Admin")
        .Produces<AddTrackResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status422UnprocessableEntity);

        return routes;
    }
}

public sealed record AddTrackBody(long DeezerTrackId);

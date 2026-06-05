using InSeconds.Api.Features.Admin.Login;
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
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
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

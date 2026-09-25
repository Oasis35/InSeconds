using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Admin.Tracks.SetTrackDisabled;

public static class SetTrackDisabledEndpoint
{
    public static IEndpointRouteBuilder MapSetTrackDisabled(this IEndpointRouteBuilder routes)
    {
        routes.MapPut("/api/admin/tracks/{id:int}/disabled", async (
            int id,
            SetTrackDisabledBody body,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new SetTrackDisabledCommand(id, body.IsDisabled), ct);
        })
        .WithName("SetTrackDisabled")
        .WithTags("Admin")
        .Produces<SetTrackDisabledResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status404NotFound)
        .Produces(StatusCodes.Status409Conflict);

        return routes;
    }
}

public sealed record SetTrackDisabledBody(bool IsDisabled);

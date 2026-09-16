using InSeconds.Api.Common.Auth;
using Wolverine;

namespace InSeconds.Api.Features.Admin.Settings.UpdateTrackCooldown;

public static class UpdateTrackCooldownEndpoint
{
    public static IEndpointRouteBuilder MapUpdateTrackCooldown(this IEndpointRouteBuilder routes)
    {
        routes.MapPut("/api/admin/settings/track-cooldown-days", async (
            UpdateTrackCooldownBody body,
            HttpContext ctx,
            IMessageBus bus,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            return await bus.InvokeAsync<IResult>(new UpdateTrackCooldownCommand(body.TrackCooldownDays), ct);
        })
        .WithName("UpdateTrackCooldown")
        .WithTags("Admin")
        .Produces<UpdateTrackCooldownResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status404NotFound);

        return routes;
    }
}

public sealed record UpdateTrackCooldownBody(int TrackCooldownDays);

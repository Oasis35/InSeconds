using InSeconds.Api.Common.Auth;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Auth.Me;

public static class MeEndpoint
{
    public static IEndpointRouteBuilder MapMe(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/auth/me", async (
            HttpContext httpContext,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            var playerId = httpContext.GetPlayerId();

            var player = await db.Players
                .AsNoTracking()
                .FirstAsync(p => p.Id == playerId, ct);

            return Results.Ok(new MeResponse(player.Id, player.IsGuest, player.Pseudo));
        })
        .WithName("Me")
        .WithTags("Auth")
        .Produces<MeResponse>(StatusCodes.Status200OK);

        return routes;
    }
}

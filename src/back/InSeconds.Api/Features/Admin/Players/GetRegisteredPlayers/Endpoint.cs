using InSeconds.Api.Common.Auth;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Players.GetRegisteredPlayers;

public static class GetRegisteredPlayersEndpoint
{
    public static IEndpointRouteBuilder MapGetRegisteredPlayers(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/players", async (
            HttpContext ctx,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            if (!ctx.GetPlayerIsAdmin())
                return Results.Unauthorized();

            // Comptes inscrits uniquement (les invités sont exclus), soft-deleted exclus par le
            // query filter. Les plus récemment vus d'abord, jamais vus en dernier.
            var players = await db.Players
                .AsNoTracking()
                .Where(p => !p.IsGuest)
                .OrderBy(p => p.LastSeenAt == null)
                .ThenByDescending(p => p.LastSeenAt)
                .ThenByDescending(p => p.CreatedAt)
                .Select(p => new RegisteredPlayerDto(
                    p.Id,
                    p.Pseudo,
                    p.Email,
                    p.CreatedAt,
                    p.LastSeenAt,
                    p.GameSessions.Count(s => s.Status == SessionStatus.Completed),
                    p.IsAdmin))
                .ToListAsync(ct);

            return Results.Ok(new RegisteredPlayersResponse(players));
        })
        .WithName("GetRegisteredPlayers")
        .WithTags("Admin")
        .Produces<RegisteredPlayersResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }
}

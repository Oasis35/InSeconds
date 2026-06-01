using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Challenges.GetChallenges;

public static class GetChallengesEndpoint
{
    public static IEndpointRouteBuilder MapGetChallenges(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/challenges", async (
            HttpContext ctx,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            var challenges = await db.DailyChallenges
                .AsNoTracking()
                .Include(c => c.Tracks)
                    .ThenInclude(t => t.Track)
                .OrderByDescending(c => c.Date)
                .Select(c => new ChallengeDto(
                    c.Id,
                    c.Date,
                    c.Tracks
                        .OrderBy(t => t.Position)
                        .Select(t => new TrackDto(t.Position, t.Track.Artist, t.Track.Title, t.Track.DeezerTrackId))
                        .ToList()))
                .ToListAsync(ct);

            return Results.Ok(challenges);
        })
        .WithName("GetAdminChallenges")
        .WithTags("Admin")
        .Produces<IReadOnlyList<ChallengeDto>>(StatusCodes.Status200OK);

        return routes;
    }
}

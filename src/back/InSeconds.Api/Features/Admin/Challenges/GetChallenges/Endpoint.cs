using InSeconds.Api.Common.Text;
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

            var raw = await db.DailyChallenges
                .AsNoTracking()
                .OrderByDescending(c => c.Date)
                .Select(c => new
                {
                    c.Id,
                    c.Date,
                    Tracks = c.Tracks
                        .OrderBy(t => t.Position)
                        .Select(t => new { t.Position, t.Track.Artist, t.Track.Title, t.Track.DeezerTrackId })
                        .ToList()
                })
                .ToListAsync(ct);

            // Nettoyage post-matérialisation (regex C# non traduisible en SQL) — même titre
            // affiché ici (Historique) que dans GetAdminStats (Stats par défi, même onglet).
            var challenges = raw.Select(c => new ChallengeDto(
                c.Id,
                c.Date,
                c.Tracks
                    .Select(t => new TrackDto(t.Position, t.Artist, TextNormalizationHelpers.CleanDisplayTitle(t.Title), t.DeezerTrackId))
                    .ToList()))
                .ToList();

            return Results.Ok(challenges);
        })
        .WithName("GetAdminChallenges")
        .WithTags("Admin")
        .Produces<IReadOnlyList<ChallengeDto>>(StatusCodes.Status200OK);

        return routes;
    }
}

using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Stats.GetAdminStats;

public static class GetAdminStatsEndpoint
{
    public static IEndpointRouteBuilder MapGetAdminStats(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/admin/stats", async (
            HttpContext ctx,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            var challengeStats = await BuildChallengeStats(db, ct);
            var dailyActivity = await BuildDailyActivity(db, ct);
            var playerBreakdown = await BuildPlayerBreakdown(db, ct);

            return Results.Ok(new AdminStatsResponse(challengeStats, dailyActivity, playerBreakdown));
        })
        .WithName("GetAdminStats")
        .WithTags("Admin")
        .Produces<AdminStatsResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }

    private static async Task<IReadOnlyList<ChallengeStatsDto>> BuildChallengeStats(ApplicationDbContext db, CancellationToken ct)
    {
        var challenges = await db.DailyChallenges
            .AsNoTracking()
            .OrderByDescending(c => c.Date)
            .Take(30)
            .Select(c => new
            {
                c.Id,
                c.Date,
                Scores         = c.GameSessions.Where(s => s.Status == Domain.SessionStatus.Completed).Select(s => s.TotalScore).ToList(),
                PendingCount   = c.GameSessions.Count(s => s.Status == Domain.SessionStatus.Pending),
                AbandonedCount = c.GameSessions.Count(s => s.Status == Domain.SessionStatus.Abandoned),
                Tracks         = c.Tracks
                    .OrderBy(t => t.Position)
                    .Select(t => new
                    {
                        t.Position,
                        t.Track.Artist,
                        t.Track.Title,
                        TotalAnswers = t.Answers.Count,
                        ArtistCorrect = t.Answers.Count(a => a.ArtistCorrect),
                        TitleCorrect = t.Answers.Count(a => a.TitleCorrect),
                        AvgListened = t.Answers.Average(a => (double?)a.ListenedDurationSeconds)
                    })
                    .ToList()
            })
            .ToListAsync(ct);

        return challenges.Select(c =>
        {
            var scores = c.Scores;
            var sorted = scores.OrderBy(s => s).ToList();
            double? median = sorted.Count == 0 ? null
                : sorted.Count % 2 == 1
                    ? sorted[sorted.Count / 2]
                    : (sorted[sorted.Count / 2 - 1] + sorted[sorted.Count / 2]) / 2.0;

            var tracks = c.Tracks.Select(t => new TrackStatsDto(
                t.Position,
                t.Artist,
                t.Title,
                t.TotalAnswers,
                t.TotalAnswers == 0 ? 0 : Math.Round((double)t.ArtistCorrect / t.TotalAnswers * 100, 1),
                t.TotalAnswers == 0 ? 0 : Math.Round((double)t.TitleCorrect / t.TotalAnswers * 100, 1),
                t.AvgListened.HasValue ? Math.Round(t.AvgListened.Value, 2) : null
            )).ToList();

            return new ChallengeStatsDto(
                c.Id,
                c.Date,
                scores.Count,
                c.PendingCount,
                c.AbandonedCount,
                scores.Count == 0 ? null : scores.Min(),
                scores.Count == 0 ? null : scores.Max(),
                scores.Count == 0 ? null : Math.Round(scores.Average(), 1),
                median,
                tracks);
        }).ToList();
    }

    private static async Task<IReadOnlyList<DailyActivityDto>> BuildDailyActivity(ApplicationDbContext db, CancellationToken ct)
    {
        var since = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-29));

        var raw = await db.GameSessions
            .AsNoTracking()
            .Where(s => s.DailyChallenge.Date >= since && s.Status == Domain.SessionStatus.Completed)
            .GroupBy(s => s.DailyChallenge.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        return raw
            .OrderBy(x => x.Date)
            .Select(x => new DailyActivityDto(x.Date, x.Count))
            .ToList();
    }

    private static async Task<PlayerBreakdownDto> BuildPlayerBreakdown(ApplicationDbContext db, CancellationToken ct)
    {
        var cutoff7 = DateTime.UtcNow.AddDays(-7);
        var cutoff30 = DateTime.UtcNow.AddDays(-30);

        var guests = await db.Players.CountAsync(p => !p.IsDeleted && p.IsGuest, ct);
        var registered = await db.Players.CountAsync(p => !p.IsDeleted && !p.IsGuest, ct);
        var active7 = await db.Players.CountAsync(p => !p.IsDeleted && p.LastSeenAt >= cutoff7, ct);
        var active30 = await db.Players.CountAsync(p => !p.IsDeleted && p.LastSeenAt >= cutoff30, ct);

        return new PlayerBreakdownDto(guests, registered, active7, active30);
    }
}

using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.Login;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.E2E;

public static class E2EResetEndpoint
{
    public static IEndpointRouteBuilder MapE2EReset(this IEndpointRouteBuilder routes)
    {
        routes.MapDelete("/api/e2e/reset", async (
            HttpContext ctx,
            ApplicationDbContext db,
            bool deleteChallenge = false,
            CancellationToken ct = default) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            await db.GameSessionAnswers.ExecuteDeleteAsync(ct);
            await db.GameSessions.ExecuteDeleteAsync(ct);

            var devPlayerId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
            await db.Players
                .Where(p => p.Id != devPlayerId)
                .ExecuteDeleteAsync(ct);

            if (deleteChallenge)
            {
                var today = DateOnly.FromDateTime(DateTime.UtcNow);
                await db.DailyChallenges
                    .Where(c => c.Date == today)
                    .ExecuteDeleteAsync(ct);
            }

            return Results.Ok(new { reset = true, challengeDeleted = deleteChallenge });
        })
        .WithName("E2EReset")
        .WithTags("E2E");

        // Purge complète + re-seed : utilisé par les tests d'intégration pour repartir d'un état propre
        routes.MapPost("/api/e2e/reseed", async (
            HttpContext ctx,
            ApplicationDbContext db,
            CancellationToken ct = default) =>
        {
            if (!LoginEndpoint.IsAdminAuthenticated(ctx))
                return Results.Unauthorized();

            await db.GameSessionAnswers.ExecuteDeleteAsync(ct);
            await db.GameSessions.ExecuteDeleteAsync(ct);
            await db.Players.ExecuteDeleteAsync(ct);
            await db.DailyChallengeTracks.ExecuteDeleteAsync(ct);
            await db.DailyChallenges.ExecuteDeleteAsync(ct);
            await db.Tracks.ExecuteDeleteAsync(ct);

            SeedData(db);

            return Results.Ok(new { reseeded = true });
        })
        .WithName("E2EReseed")
        .WithTags("E2E");

        return routes;
    }

    public static void PurgeSeedData(ApplicationDbContext db)
    {
        db.GameSessionAnswers.ExecuteDelete();
        db.GameSessions.ExecuteDelete();
        db.Players.ExecuteDelete();
        db.DailyChallengeTracks.ExecuteDelete();
        db.DailyChallenges.ExecuteDelete();
        db.Tracks.ExecuteDelete();
    }

    public static void SeedData(ApplicationDbContext db)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var allTracks = new (long DeezerTrackId, string Artist, string Title, string? CoverHash)[]
        {
            // J-2
            (67238735,  "Daft Punk",         "Get Lucky",         "b63b04be8ef880c3c65f0e7d13b2e4da"),
            (6337356,   "Stromae",           "Alors on danse",    "6de41a2ce00c20680b5bcd8e21e748e2"),
            (879930,    "Coldplay",          "Yellow",            "9d8b1b0f5aec0e5cf15efbecc48a8c20"),
            // J-1
            (76580611,  "Pharrell Williams", "Happy",             "6bbb2ea1e2b72e4267ec89e1a4a2e6c3"),
            (1109731,   "Amy Winehouse",     "Rehab",             "4a0db9e4bb66b285e836c8b2a7a5e5e6"),
            (921709,    "Gorillaz",          "Feel Good Inc.",    "2a3d1e2ce90c20680b5bcd8e21e748e2"),
            // Aujourd'hui
            (912486,    "Eminem",            "Lose Yourself",     "7de41a2ce00c20680b5bcd8e21e748e2"),
            (618340,    "Radiohead",         "Creep",             "1bb2ea1e2b72e4267ec89e1a4a2e6a44"),
            (624174012, "Billie Eilish",     "Bad Guy",           "5ab2ea1e2b72e4267ec89e1a4a2e6c55"),
        };

        var tracks = allTracks.Select(t => new Track
        {
            DeezerTrackId = t.DeezerTrackId,
            Artist        = t.Artist,
            Title         = t.Title,
            CoverHash     = t.CoverHash,
            CreatedAt     = DateTime.UtcNow,
        }).ToList();

        db.Tracks.AddRange(tracks);
        db.SaveChanges();

        var days = new[] { today.AddDays(-2), today.AddDays(-1), today };
        var challenges = days.Select(d => new DailyChallenge { Date = d, Seed = d.DayNumber }).ToList();
        db.DailyChallenges.AddRange(challenges);
        db.SaveChanges();

        var tracksByDay = new[] { tracks[..3], tracks[3..6], tracks[6..9] };
        for (var i = 0; i < challenges.Count; i++)
        {
            db.DailyChallengeTracks.AddRange(tracksByDay[i].Select((t, pos) => new DailyChallengeTrack
            {
                DailyChallengeId   = challenges[i].Id,
                TrackId            = t.Id,
                Position           = pos + 1,
                DeezerRankSnapshot = 0,
            }));
        }
        db.SaveChanges();

        var devPlayer = new Player
        {
            Id             = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001"),
            IsGuest        = true,
            AuthToken      = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000001"),
            CreatedAt      = DateTime.UtcNow,
            CurrentStreak  = 2,
            LastPlayedDate = today.AddDays(-1),
        };
        db.Players.Add(devPlayer);
        db.SaveChanges();

        foreach (var (challenge, dayOffset) in challenges[..2].Select((c, i) => (c, i)))
        {
            db.GameSessions.Add(new GameSession
            {
                PlayerId             = devPlayer.Id,
                DailyChallengeId     = challenge.Id,
                TotalScore           = 2550,
                TotalDurationSeconds = 1.5m,
                CreatedAt            = DateTime.SpecifyKind(
                    days[dayOffset].ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(12))),
                    DateTimeKind.Utc),
            });
        }
        db.SaveChanges();
    }
}

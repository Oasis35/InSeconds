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

            // IgnoreQueryFilters : supprime aussi les lignes des joueurs soft-deleted
            await db.GameSessionAnswers.IgnoreQueryFilters().ExecuteDeleteAsync(ct);
            await db.GameSessions.IgnoreQueryFilters().ExecuteDeleteAsync(ct);
            await db.Players.IgnoreQueryFilters().ExecuteDeleteAsync(ct);
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

        // IDs Deezer vérifiés + CoverHash réels (extraits de l'API Deezer)
        var allTracks = new (long DeezerTrackId, string Artist, string Title, string? CoverHash)[]
        {
            // J-2
            (66609426,  "Daft Punk",         "Get Lucky",         "bc49adb87758e0c8c4e508a9c5cce85d"),
            (6297555,   "Stromae",           "Alors on danse",    "43bd78a4753df33da9efc2207c4286ee"),
            (3128096,   "Coldplay",          "Yellow",            "970dce98eeea6729244c0ae71707a83d"),
            // J-1
            (701326562, "Pharrell Williams", "Happy",             "a1939a9a40dc97ed404cc4597c6a32bc"),
            (2176852,   "Amy Winehouse",     "Rehab",             "5772b495f0dcdf660d0fc88c4c38a3fa"),
            (3129407,   "Gorillaz",          "Feel Good Inc.",    "3dc29a565149240729afc08e1f251b46"),
            // Aujourd'hui
            (1109731,   "Eminem",            "Lose Yourself",     "e2b36a9fda865cb2e9ed1476b6291a7d"),
            (138547415, "Radiohead",         "Creep",             "1dd56fd8824492e1a5106c99a00a85ec"),
            (655095912, "Billie Eilish",     "bad guy",           "6630083f454d48eadb6a9b53f035d734"),
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

        // Sessions J-2 et J-1 — Status=Completed pour apparaître dans les stats
        foreach (var (challenge, dayOffset) in challenges[..2].Select((c, i) => (c, i)))
        {
            var completedAt = DateTime.SpecifyKind(
                days[dayOffset].ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(12, 5, 0))),
                DateTimeKind.Utc);
            db.GameSessions.Add(new GameSession
            {
                PlayerId             = devPlayer.Id,
                DailyChallengeId     = challenge.Id,
                TotalScore           = 2550,
                TotalDurationSeconds = 1.5m,
                CreatedAt            = DateTime.SpecifyKind(
                    days[dayOffset].ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(12))),
                    DateTimeKind.Utc),
                Status      = Domain.SessionStatus.Completed,
                CompletedAt = completedAt,
            });
        }
        db.SaveChanges();
    }
}

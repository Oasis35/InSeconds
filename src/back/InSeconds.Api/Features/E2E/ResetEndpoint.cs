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
            bool emptyPool = false,
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

            // Rend le pool insuffisant : depuis la génération paresseuse dans
            // StartSession, supprimer le défi ne suffit plus à obtenir l'écran
            // « pas de défi » (il renaîtrait au premier joueur). Restaurer via /reseed.
            if (emptyPool)
            {
                await db.Tracks.ExecuteUpdateAsync(
                    s => s.SetProperty(t => t.HasPreview, false), ct);
            }

            return Results.Ok(new { reset = true, challengeDeleted = deleteChallenge, poolEmptied = emptyPool });
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
        // Les 9 premiers morceaux sont utilisés pour les défis J-2/J-1/aujourd'hui (ordre fixe — tests E2E).
        // Les suivants constituent le pool disponible (admin).
        var allTracks = new (long DeezerTrackId, string Artist, string Title, string? CoverHash)[]
        {
            // J-2
            (66609426,    "Daft Punk",              "Get Lucky",                    "bc49adb87758e0c8c4e508a9c5cce85d"),
            (6297555,     "Stromae",                "Alors on danse",               "43bd78a4753df33da9efc2207c4286ee"),
            (3128096,     "Coldplay",               "Yellow",                       "970dce98eeea6729244c0ae71707a83d"),
            // J-1
            (701326562,   "Pharrell Williams",      "Happy",                        "a1939a9a40dc97ed404cc4597c6a32bc"),
            (2176852,     "Amy Winehouse",           "Rehab",                        "5772b495f0dcdf660d0fc88c4c38a3fa"),
            (3129407,     "Gorillaz",               "Feel Good Inc.",               "3dc29a565149240729afc08e1f251b46"),
            // Aujourd'hui
            (1109731,     "Eminem",                 "Lose Yourself",                "e2b36a9fda865cb2e9ed1476b6291a7d"),
            (138547415,   "Radiohead",              "Creep",                        "1dd56fd8824492e1a5106c99a00a85ec"),
            (655095912,   "Billie Eilish",           "bad guy",                      "6630083f454d48eadb6a9b53f035d734"),
            // Pool disponible
            (4603408,     "Michael Jackson",         "Billie Jean",                  "a0ad67d1beb761f2cb9f8b60e5bcf07a"),
            (5055001,     "Queen",                  "Bohemian Rhapsody",            "6bfb24a6d8f37ba563284d311586f2be"),
            (13791930,    "Nirvana",                "Smells Like Teen Spirit",      "f0282817b697279e56df13909962a54a"),
            (908604612,   "The Weeknd",             "Blinding Lights",              "fd00ebd6d30d7253f813dba3bb1c66a9"),
            (8086126,     "Adele",                  "Rolling in the Deep",          "dc1ce848d830ecc93521be5a78350364"),
            (139470659,   "Ed Sheeran",             "Shape of You",                 "107c2b43f10c249077c1f7618563bb63"),
            (92734438,    "Mark Ronson",            "Uptown Funk",                  "3734366a73152d0367a83a4b09fd163f"),
            (2553265,     "Beyoncé",                "Halo",                         "7cf0bdc409e7a7898c745bf0244df312"),
            (925106,      "Rihanna",                "Umbrella",                     "91276466fbc876d96be9e6926060af60"),
            (969494,      "Justin Timberlake",       "Cry Me a River",               "7cba368fa8466d72d149264577cb19d7"),
            (1178682,     "Kanye West",             "Stronger",                     "15012d974c6263aec95e52e6d86cba23"),
            (676960,      "JAY Z",                  "99 Problems",                  "7245b8fe756d39f20a53020163168dbe"),
            (350171311,   "Kendrick Lamar",         "HUMBLE.",                      "7ce6b8452fae425557067db6e6a1cad5"),
            (533609232,   "Drake",                  "God's Plan",                   "b69d3bcbd130ad4cc9259de543889e30"),
            (2783963122,  "Kendrick Lamar",         "Not Like Us",                  "84345d29bc2ed8e713112425f8417e97"),
            (435821782,   "Childish Gambino",        "Redbone",                      "964acadabc2b6e286ce5e8e5add495a0"),
            (653159322,   "PNL",                    "Au DD",                        "ff5caf314549e1cff1960c5b2acfd384"),
            (414838122,   "Orelsan",                "Basique",                      "90f68d5df45b5f24710a70deb571d350"),
            (546875572,   "Angèle",                 "Balance ton quoi",             "4a2360324af313f73b56fd1f7faaac88"),
            (870857,      "Suprême NTM",            "Ma Benz",                      "529623a3281a7709098859887ddfa467"),
            (369711461,   "Booba",                  "Ouest Side",                   "7fa62027aafd910591ac2ab292fbfbf3"),
            (70322132,    "Arctic Monkeys",          "R U Mine?",                    "64e54e307bd5e2bdb27ffeb662fd910d"),
            (3590186,     "Muse",                   "Supermassive Black Hole",      "fc457d27a8c0b7fc6f9b56fb94e22a0d"),
            (461043312,   "David Bowie",            "\"Heroes\"",                   "5fb91018679f65199308256be3c584ab"),
            (2525864,     "The Police",             "Every Breath You Take",        "316afdaed93c4a18cf730389648d03d6"),
            (985745702,   "Oasis",                  "Wonderwall",                   "ddb062c517401ee74d8a4df6f895d75e"),
            (138539157,   "Radiohead",              "No Surprises",                 "7a378976d3ff1b1fd7b21ee0c7f95fa5"),
            (3102130,     "Blur",                   "Song 2",                       "1e6f6130ca0ccbdd0cde4dc2b05e6df9"),
            (958109,      "The Strokes",            "Last Nite",                    "700f0375d5ac8570f16a2c7eb128303f"),
            (13791932,    "Nirvana",                "Come As You Are",              "f0282817b697279e56df13909962a54a"),
            (676183,      "Linkin Park",            "In the End",                   "033a271b5ec10842c287827c39244fb5"),
            (103052662,   "Tame Impala",            "The Less I Know The Better",   "de5b9b704cd4ec36f8bf49beb3e17ba2"),
            (10284909,    "Justice",                "D.A.N.C.E.",                   "d779ba5bc3bb32475a78909d97cf8964"),
            (3129748,     "Massive Attack",          "Teardrop",                     "85abbdc3ed4a7b94ace97f868fe70f63"),
            (3130293,     "The Chemical Brothers",   "Galvanize",                    "51d7e6bb289a89b531aaa7d047baa6ea"),
            (62126191,    "The Prodigy",            "Firestarter",                  "566d28d32080a6d82a2d4d145ea5ea7e"),
            (1124841682,  "Dua Lipa",               "Levitating",                   "f8364f090ba04f1b19b381ec0390f3e4"),
            (742744952,   "Post Malone",            "Circles",                      "6fb46005a49df7aeba49f1ca117f3710"),
            (797228462,   "Doja Cat",               "Say So",                       "1e0d4359a328f8b0ea3563e8623a09aa"),
            (18190280,    "Lana Del Rey",           "Summertime Sadness",           "4c2c6143c3e83a01ea73517c57d1d138"),
            (2743578151,  "Sabrina Carpenter",       "Espresso",                     "e3221287a77eb262944e6528766eeba4"),
            // Morceaux sans preview (IDs >= 9_000_000_000 → FakeDeezerHandler retourne preview vide)
            (9000000001,  "The Beatles",             "Come Together",                null),
            (9000000002,  "Pink Floyd",              "Comfortably Numb",             null),
            (9000000003,  "Bob Dylan",               "Like a Rolling Stone",         null),
            (9000000004,  "Led Zeppelin",            "Stairway to Heaven",           null),
            (9000000005,  "Fleetwood Mac",           "Go Your Own Way",              null),
        };

        var tracks = allTracks.Select(t => new Track
        {
            DeezerTrackId = t.DeezerTrackId,
            Artist        = t.Artist,
            Title         = t.Title,
            CoverHash     = t.CoverHash,
            HasPreview    = t.DeezerTrackId < 9_000_000_000,
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
                DeezerRankSnapshot = pos + 1,
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

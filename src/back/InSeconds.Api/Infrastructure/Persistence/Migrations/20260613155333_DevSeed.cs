using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DevSeed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── Tracks (30 morceaux, IDs Deezer vérifiés avec preview) ────
            migrationBuilder.Sql("""
                INSERT INTO "Tracks" ("Artist", "Title", "DeezerTrackId", "CoverHash", "CreatedAt")
                VALUES
                  ('Daft Punk',          'Get Lucky',              67238735,   'b63b04be8ef880c3c65f0e7d13b2e4da', NOW() AT TIME ZONE 'utc'),
                  ('Stromae',            'Alors on danse',         6297555,    '6de41a2ce00c20680b5bcd8e21e748e2', NOW() AT TIME ZONE 'utc'),
                  ('Coldplay',           'Yellow',                 3128096,    '9d8b1b0f5aec0e5cf15efbecc48a8c20', NOW() AT TIME ZONE 'utc'),
                  ('Pharrell Williams',  'Happy',                  701326562,  '6bbb2ea1e2b72e4267ec89e1a4a2e6c3', NOW() AT TIME ZONE 'utc'),
                  ('Amy Winehouse',      'Rehab',                  2176852,    '4a0db9e4bb66b285e836c8b2a7a5e5e6', NOW() AT TIME ZONE 'utc'),
                  ('Gorillaz',           'Feel Good Inc.',         3129407,    '2a3d1e2ce90c20680b5bcd8e21e748e2', NOW() AT TIME ZONE 'utc'),
                  ('Eminem',             'Lose Yourself',          1109731,    '7de41a2ce00c20680b5bcd8e21e748e2', NOW() AT TIME ZONE 'utc'),
                  ('Radiohead',          'Creep',                  138547415,  '1bb2ea1e2b72e4267ec89e1a4a2e6c4', NOW() AT TIME ZONE 'utc'),
                  ('Billie Eilish',      'Bad Guy',                624174012,  '5ab2ea1e2b72e4267ec89e1a4a2e6c5', NOW() AT TIME ZONE 'utc'),
                  ('Michael Jackson',    'Billie Jean',            58449185,   'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', NOW() AT TIME ZONE 'utc'),
                  ('Queen',              'Bohemian Rhapsody',      109661862,  'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7', NOW() AT TIME ZONE 'utc'),
                  ('Nirvana',            'Smells Like Teen Spirit', 7669838,   'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8', NOW() AT TIME ZONE 'utc'),
                  ('The Weeknd',         'Blinding Lights',        867738782,  'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9', NOW() AT TIME ZONE 'utc'),
                  ('Adele',              'Rolling in the Deep',    10853017,   'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', NOW() AT TIME ZONE 'utc'),
                  ('Ed Sheeran',         'Shape of You',           369991485,  'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1', NOW() AT TIME ZONE 'utc'),
                  ('Bruno Mars',         'Uptown Funk',            110006740,  'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2', NOW() AT TIME ZONE 'utc'),
                  ('Beyoncé',            'Halo',                   5015315,    'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3', NOW() AT TIME ZONE 'utc'),
                  ('Rihanna',            'Umbrella',               553506,     'c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4', NOW() AT TIME ZONE 'utc'),
                  ('Justin Timberlake',  'Cry Me a River',         2290992,    'd0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5', NOW() AT TIME ZONE 'utc'),
                  ('Kanye West',         'Stronger',               1489606,    'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6', NOW() AT TIME ZONE 'utc'),
                  ('Jay-Z',              '99 Problems',            2166845,    'f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7', NOW() AT TIME ZONE 'utc'),
                  ('Arctic Monkeys',     'R U Mine?',              74547848,   'a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8', NOW() AT TIME ZONE 'utc'),
                  ('The Strokes',        'Last Nite',              896259,     'b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9', NOW() AT TIME ZONE 'utc'),
                  ('Muse',               'Supermassive Black Hole',1360327,    'c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0', NOW() AT TIME ZONE 'utc'),
                  ('Rage Against the Machine', 'Killing in the Name', 89355,  'd6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1', NOW() AT TIME ZONE 'utc'),
                  ('David Bowie',        'Heroes',                 1033801,    'e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2', NOW() AT TIME ZONE 'utc'),
                  ('The Police',         'Every Breath You Take',  2303839,    'f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3', NOW() AT TIME ZONE 'utc'),
                  ('Tame Impala',        'The Less I Know the Better', 466237992, 'a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4', NOW() AT TIME ZONE 'utc'),
                  ('Dua Lipa',           'Levitating',             960553082,  'b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5', NOW() AT TIME ZONE 'utc'),
                  ('Post Malone',        'Circles',                797803622,  'c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6', NOW() AT TIME ZONE 'utc')
                ON CONFLICT ("DeezerTrackId") DO NOTHING;
            """);

            // ── DailyChallenges : J-4 à aujourd'hui (5 jours) ────────────
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallenges" ("Date", "Seed")
                VALUES
                  (CURRENT_DATE - 4, EXTRACT(EPOCH FROM CURRENT_DATE - 4)::int),
                  (CURRENT_DATE - 3, EXTRACT(EPOCH FROM CURRENT_DATE - 3)::int),
                  (CURRENT_DATE - 2, EXTRACT(EPOCH FROM CURRENT_DATE - 2)::int),
                  (CURRENT_DATE - 1, EXTRACT(EPOCH FROM CURRENT_DATE - 1)::int),
                  (CURRENT_DATE,     EXTRACT(EPOCH FROM CURRENT_DATE)::int)
                ON CONFLICT ("Date") DO NOTHING;
            """);

            // ── DailyChallengeTracks : 3 morceaux par défi ───────────────
            // J-4 : Michael Jackson, Queen, Nirvana
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (58449185::bigint, 1), (109661862::bigint, 2), (7669838::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 4
                ON CONFLICT DO NOTHING;
            """);

            // J-3 : The Weeknd, Adele, Ed Sheeran
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (867738782::bigint, 1), (10853017::bigint, 2), (369991485::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 3
                ON CONFLICT DO NOTHING;
            """);

            // J-2 : Daft Punk, Stromae, Coldplay
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (67238735::bigint, 1), (6297555::bigint, 2), (3128096::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 2
                ON CONFLICT DO NOTHING;
            """);

            // J-1 : Pharrell, Amy Winehouse, Gorillaz
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (701326562::bigint, 1), (2176852::bigint, 2), (3129407::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 1
                ON CONFLICT DO NOTHING;
            """);

            // Aujourd'hui : Eminem, Radiohead, Billie Eilish
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (1109731::bigint, 1), (138547415::bigint, 2), (624174012::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE
                ON CONFLICT DO NOTHING;
            """);

            // ── Player dev + GameSessions J-2 et J-1 (streak = 2 acquis) ─
            // Le joueur joue aujourd'hui → streak passera à 3 au StartSession
            migrationBuilder.Sql("""
                INSERT INTO "Players" ("Id", "IsGuest", "Pseudo", "AuthToken", "CreatedAt", "CurrentStreak", "LastPlayedDate")
                VALUES (
                  'aaaaaaaa-0000-0000-0000-000000000001',
                  true,
                  NULL,
                  'bbbbbbbb-0000-0000-0000-000000000001',
                  NOW() AT TIME ZONE 'utc',
                  4,
                  CURRENT_DATE - 1
                )
                ON CONFLICT ("Id") DO NOTHING;
            """);

            migrationBuilder.Sql("""
                INSERT INTO "GameSessions" ("PlayerId", "DailyChallengeId", "TotalScore", "TotalDurationSeconds", "CreatedAt")
                SELECT
                  'aaaaaaaa-0000-0000-0000-000000000001',
                  dc."Id",
                  2550,
                  2.0,
                  (dc."Date"::timestamp AT TIME ZONE 'utc') + INTERVAL '12 hours'
                FROM "DailyChallenges" dc
                WHERE dc."Date" IN (CURRENT_DATE - 4, CURRENT_DATE - 3, CURRENT_DATE - 2, CURRENT_DATE - 1)
                ON CONFLICT DO NOTHING;
            """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DELETE FROM "GameSessions"  WHERE "PlayerId" = 'aaaaaaaa-0000-0000-0000-000000000001';
                DELETE FROM "Players"       WHERE "Id"       = 'aaaaaaaa-0000-0000-0000-000000000001';
                DELETE FROM "DailyChallengeTracks"
                  WHERE "DailyChallengeId" IN (
                    SELECT "Id" FROM "DailyChallenges"
                    WHERE "Date" IN (CURRENT_DATE - 4, CURRENT_DATE - 3, CURRENT_DATE - 2, CURRENT_DATE - 1, CURRENT_DATE)
                  );
                DELETE FROM "DailyChallenges" WHERE "Date" IN (CURRENT_DATE - 4, CURRENT_DATE - 3, CURRENT_DATE - 2, CURRENT_DATE - 1, CURRENT_DATE);
                DELETE FROM "Tracks" WHERE "DeezerTrackId" IN (
                  67238735, 6297555, 3128096, 701326562, 2176852, 3129407, 1109731, 138547415, 624174012,
                  58449185, 109661862, 7669838, 867738782, 10853017, 369991485, 110006740, 5015315,
                  553506, 2290992, 1489606, 2166845, 74547848, 896259, 1360327, 89355,
                  1033801, 2303839, 466237992, 960553082, 797803622
                );
            """);
        }
    }
}

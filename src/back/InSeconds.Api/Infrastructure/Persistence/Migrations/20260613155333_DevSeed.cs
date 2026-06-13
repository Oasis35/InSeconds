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
            // ── Tracks (9 morceaux, 3 par jour) ───────────────────────────
            migrationBuilder.Sql("""
                INSERT INTO "Tracks" ("Artist", "Title", "DeezerTrackId", "CoverHash", "CreatedAt")
                VALUES
                  ('Daft Punk',   'Get Lucky',             67238735,   'b63b04be8ef880c3c65f0e7d13b2e4da', NOW() AT TIME ZONE 'utc'),
                  ('Stromae',     'Alors on danse',        6337356,    '6de41a2ce00c20680b5bcd8e21e748e2', NOW() AT TIME ZONE 'utc'),
                  ('Coldplay',    'Yellow',                879930,     '9d8b1b0f5aec0e5cf15efbecc48a8c20', NOW() AT TIME ZONE 'utc'),
                  ('Pharrell Williams', 'Happy',           76580611,   '6bbb2ea1e2b72e4267ec89e1a4a2e6c3', NOW() AT TIME ZONE 'utc'),
                  ('Amy Winehouse','Rehab',                1109731,    '4a0db9e4bb66b285e836c8b2a7a5e5e6', NOW() AT TIME ZONE 'utc'),
                  ('Gorillaz',    'Feel Good Inc.',        921709,     '2a3d1e2ce90c20680b5bcd8e21e748e2', NOW() AT TIME ZONE 'utc'),
                  ('Eminem',      'Lose Yourself',         912486,     '7de41a2ce00c20680b5bcd8e21e748e2', NOW() AT TIME ZONE 'utc'),
                  ('Radiohead',   'Creep',                 618340,     '1bb2ea1e2b72e4267ec89e1a4a2e6c4', NOW() AT TIME ZONE 'utc'),
                  ('Billie Eilish','Bad Guy',              624174012,  '5ab2ea1e2b72e4267ec89e1a4a2e6c5', NOW() AT TIME ZONE 'utc')
                ON CONFLICT ("DeezerTrackId") DO NOTHING;
            """);

            // ── DailyChallenges : J-2, J-1, aujourd'hui ──────────────────
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallenges" ("Date", "Seed")
                VALUES
                  (CURRENT_DATE - 2, EXTRACT(EPOCH FROM CURRENT_DATE - 2)::int),
                  (CURRENT_DATE - 1, EXTRACT(EPOCH FROM CURRENT_DATE - 1)::int),
                  (CURRENT_DATE,     EXTRACT(EPOCH FROM CURRENT_DATE)::int)
                ON CONFLICT ("Date") DO NOTHING;
            """);

            // ── DailyChallengeTracks : 3 morceaux par défi ───────────────
            // J-2 : Daft Punk, Stromae, Coldplay
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (67238735::bigint, 1), (6337356::bigint, 2), (879930::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 2
                ON CONFLICT DO NOTHING;
            """);

            // J-1 : Pharrell, Amy Winehouse, Gorillaz
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (76580611::bigint, 1), (1109731::bigint, 2), (921709::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 1
                ON CONFLICT DO NOTHING;
            """);

            // Aujourd'hui : Eminem, Radiohead, Billie Eilish
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (912486::bigint, 1), (618340::bigint, 2), (624174012::bigint, 3)) AS pos(deezer_id, pos)
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
                  2,
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
                WHERE dc."Date" IN (CURRENT_DATE - 2, CURRENT_DATE - 1)
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
                    WHERE "Date" IN (CURRENT_DATE - 2, CURRENT_DATE - 1, CURRENT_DATE)
                  );
                DELETE FROM "DailyChallenges" WHERE "Date" IN (CURRENT_DATE - 2, CURRENT_DATE - 1, CURRENT_DATE);
                DELETE FROM "Tracks" WHERE "DeezerTrackId" IN (
                  67238735, 6337356, 879930, 76580611, 1109731, 921709, 912486, 618340, 624174012
                );
            """);
        }
    }
}

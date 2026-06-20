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
            // ── Tracks (50 morceaux, IDs Deezer + CoverHash vérifiés via API) ──
            migrationBuilder.Sql("""
                INSERT INTO "Tracks" ("Artist", "Title", "DeezerTrackId", "CoverHash", "CreatedAt")
                VALUES
                  -- Pop / Urban internationale
                  ('Daft Punk',               'Get Lucky',                         66609426,    'bc49adb87758e0c8c4e508a9c5cce85d', NOW() AT TIME ZONE 'utc'),
                  ('Stromae',                  'Alors on danse',                    6297555,     '43bd78a4753df33da9efc2207c4286ee', NOW() AT TIME ZONE 'utc'),
                  ('Coldplay',                 'Yellow',                            3128096,     '970dce98eeea6729244c0ae71707a83d', NOW() AT TIME ZONE 'utc'),
                  ('Pharrell Williams',         'Happy',                             701326562,   'a1939a9a40dc97ed404cc4597c6a32bc', NOW() AT TIME ZONE 'utc'),
                  ('Amy Winehouse',             'Rehab',                             2176852,     '5772b495f0dcdf660d0fc88c4c38a3fa', NOW() AT TIME ZONE 'utc'),
                  ('Gorillaz',                 'Feel Good Inc.',                    3129407,     '3dc29a565149240729afc08e1f251b46', NOW() AT TIME ZONE 'utc'),
                  ('Eminem',                   'Lose Yourself',                     1109731,     'e2b36a9fda865cb2e9ed1476b6291a7d', NOW() AT TIME ZONE 'utc'),
                  ('Radiohead',                'Creep',                             138547415,   '1dd56fd8824492e1a5106c99a00a85ec', NOW() AT TIME ZONE 'utc'),
                  ('Billie Eilish',             'bad guy',                           655095912,   '6630083f454d48eadb6a9b53f035d734', NOW() AT TIME ZONE 'utc'),
                  ('Michael Jackson',           'Billie Jean',                       4603408,     'a0ad67d1beb761f2cb9f8b60e5bcf07a', NOW() AT TIME ZONE 'utc'),
                  ('Queen',                    'Bohemian Rhapsody',                 9997018,     '6706f1154083f461a348508c28030a30', NOW() AT TIME ZONE 'utc'),
                  ('Nirvana',                  'Smells Like Teen Spirit',           13791930,    'f0282817b697279e56df13909962a54a', NOW() AT TIME ZONE 'utc'),
                  ('The Weeknd',               'Blinding Lights',                   908604612,   'fd00ebd6d30d7253f813dba3bb1c66a9', NOW() AT TIME ZONE 'utc'),
                  ('Adele',                    'Rolling in the Deep',               8086126,     'dc1ce848d830ecc93521be5a78350364', NOW() AT TIME ZONE 'utc'),
                  ('Ed Sheeran',               'Shape of You',                      139470659,   '107c2b43f10c249077c1f7618563bb63', NOW() AT TIME ZONE 'utc'),
                  ('Mark Ronson',              'Uptown Funk',                       92734438,    '3734366a73152d0367a83a4b09fd163f', NOW() AT TIME ZONE 'utc'),
                  ('Beyoncé',                  'Halo',                              2553265,     '7cf0bdc409e7a7898c745bf0244df312', NOW() AT TIME ZONE 'utc'),
                  ('Rihanna',                  'Umbrella',                          925106,      '91276466fbc876d96be9e6926060af60', NOW() AT TIME ZONE 'utc'),
                  ('Justin Timberlake',         'Cry Me a River',                   969494,      '7cba368fa8466d72d149264577cb19d7', NOW() AT TIME ZONE 'utc'),
                  ('Kanye West',               'Stronger',                          1178682,     '15012d974c6263aec95e52e6d86cba23', NOW() AT TIME ZONE 'utc'),
                  -- Rap / Hip-Hop
                  ('JAY Z',                    '99 Problems',                       676960,      '7245b8fe756d39f20a53020163168dbe', NOW() AT TIME ZONE 'utc'),
                  ('Kendrick Lamar',           'HUMBLE.',                           350171311,   '7ce6b8452fae425557067db6e6a1cad5', NOW() AT TIME ZONE 'utc'),
                  ('Drake',                    'God''s Plan',                       533609232,   'b69d3bcbd130ad4cc9259de543889e30', NOW() AT TIME ZONE 'utc'),
                  ('Kendrick Lamar',           'Not Like Us',                       2783963122,  '84345d29bc2ed8e713112425f8417e97', NOW() AT TIME ZONE 'utc'),
                  ('Childish Gambino',         'Redbone',                           435821782,   '964acadabc2b6e286ce5e8e5add495a0', NOW() AT TIME ZONE 'utc'),
                  -- Rap FR
                  ('PNL',                      'Au DD',                             653159322,   'ff5caf314549e1cff1960c5b2acfd384', NOW() AT TIME ZONE 'utc'),
                  ('Orelsan',                  'Basique',                           414838122,   '90f68d5df45b5f24710a70deb571d350', NOW() AT TIME ZONE 'utc'),
                  ('Angèle',                   'Balance ton quoi',                  546875572,   '4a2360324af313f73b56fd1f7faaac88', NOW() AT TIME ZONE 'utc'),
                  ('Suprême NTM',              'Ma Benz',                           870857,      '529623a3281a7709098859887ddfa467', NOW() AT TIME ZONE 'utc'),
                  ('Booba',                    'Ouest Side',                        369711461,   '7fa62027aafd910591ac2ab292fbfbf3', NOW() AT TIME ZONE 'utc'),
                  -- Rock / Indie
                  ('Arctic Monkeys',           'R U Mine?',                         70322132,    '64e54e307bd5e2bdb27ffeb662fd910d', NOW() AT TIME ZONE 'utc'),
                  ('Muse',                     'Supermassive Black Hole',           3590186,     'fc457d27a8c0b7fc6f9b56fb94e22a0d', NOW() AT TIME ZONE 'utc'),
                  ('David Bowie',              '"Heroes"',                          461043312,   '5fb91018679f65199308256be3c584ab', NOW() AT TIME ZONE 'utc'),
                  ('The Police',               'Every Breath You Take',             2525864,     '316afdaed93c4a18cf730389648d03d6', NOW() AT TIME ZONE 'utc'),
                  ('Oasis',                    'Wonderwall',                        985745702,   'ddb062c517401ee74d8a4df6f895d75e', NOW() AT TIME ZONE 'utc'),
                  ('Radiohead',                'No Surprises',                      138539157,   '7a378976d3ff1b1fd7b21ee0c7f95fa5', NOW() AT TIME ZONE 'utc'),
                  ('Blur',                     'Song 2',                            3102130,     '1e6f6130ca0ccbdd0cde4dc2b05e6df9', NOW() AT TIME ZONE 'utc'),
                  ('The Strokes',              'Last Nite',                         958109,      '700f0375d5ac8570f16a2c7eb128303f', NOW() AT TIME ZONE 'utc'),
                  ('Nirvana',                  'Come as You Are',                   14914978,    'f0282817b697279e56df13909962a54a', NOW() AT TIME ZONE 'utc'),
                  ('Linkin Park',              'In the End',                        676183,      '033a271b5ec10842c287827c39244fb5', NOW() AT TIME ZONE 'utc'),
                  -- Électro / Dance
                  ('Tame Impala',              'The Less I Know The Better',        103052662,   'de5b9b704cd4ec36f8bf49beb3e17ba2', NOW() AT TIME ZONE 'utc'),
                  ('Justice',                  'D.A.N.C.E.',                        10284909,    'd779ba5bc3bb32475a78909d97cf8964', NOW() AT TIME ZONE 'utc'),
                  ('Massive Attack',           'Teardrop',                          3129748,     '85abbdc3ed4a7b94ace97f868fe70f63', NOW() AT TIME ZONE 'utc'),
                  ('The Chemical Brothers',    'Galvanize',                         3130293,     '51d7e6bb289a89b531aaa7d047baa6ea', NOW() AT TIME ZONE 'utc'),
                  ('The Prodigy',              'Firestarter',                       62126191,    '566d28d32080a6d82a2d4d145ea5ea7e', NOW() AT TIME ZONE 'utc'),
                  -- R&B / Soul / Pop actuelle
                  ('Dua Lipa',                 'Levitating',                        1124841682,  'f8364f090ba04f1b19b381ec0390f3e4', NOW() AT TIME ZONE 'utc'),
                  ('Post Malone',              'Circles',                           742744952,   '6fb46005a49df7aeba49f1ca117f3710', NOW() AT TIME ZONE 'utc'),
                  ('Doja Cat',                 'Say So',                            797228462,   '1e0d4359a328f8b0ea3563e8623a09aa', NOW() AT TIME ZONE 'utc'),
                  ('Lana Del Rey',             'Summertime Sadness',                18190280,    '4c2c6143c3e83a01ea73517c57d1d138', NOW() AT TIME ZONE 'utc'),
                  ('Sabrina Carpenter',        'Espresso',                          2743578151,  'e3221287a77eb262944e6528766eeba4', NOW() AT TIME ZONE 'utc')
                ON CONFLICT ("DeezerTrackId") DO NOTHING;
            """);

            // ── DailyChallenges : J-9 à aujourd'hui (10 jours) ──────────────
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallenges" ("Date", "Seed")
                VALUES
                  (CURRENT_DATE - 9, EXTRACT(EPOCH FROM CURRENT_DATE - 9)::int),
                  (CURRENT_DATE - 8, EXTRACT(EPOCH FROM CURRENT_DATE - 8)::int),
                  (CURRENT_DATE - 7, EXTRACT(EPOCH FROM CURRENT_DATE - 7)::int),
                  (CURRENT_DATE - 6, EXTRACT(EPOCH FROM CURRENT_DATE - 6)::int),
                  (CURRENT_DATE - 5, EXTRACT(EPOCH FROM CURRENT_DATE - 5)::int),
                  (CURRENT_DATE - 4, EXTRACT(EPOCH FROM CURRENT_DATE - 4)::int),
                  (CURRENT_DATE - 3, EXTRACT(EPOCH FROM CURRENT_DATE - 3)::int),
                  (CURRENT_DATE - 2, EXTRACT(EPOCH FROM CURRENT_DATE - 2)::int),
                  (CURRENT_DATE - 1, EXTRACT(EPOCH FROM CURRENT_DATE - 1)::int),
                  (CURRENT_DATE,     EXTRACT(EPOCH FROM CURRENT_DATE)::int)
                ON CONFLICT ("Date") DO NOTHING;
            """);

            // ── DailyChallengeTracks : 3 morceaux par défi ──────────────────
            // J-9 : Michael Jackson, Queen, Nirvana (Smells)
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (4603408::bigint, 1), (9997018::bigint, 2), (13791930::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 9
                ON CONFLICT DO NOTHING;
            """);

            // J-8 : The Weeknd, Adele, Ed Sheeran
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (908604612::bigint, 1), (8086126::bigint, 2), (139470659::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 8
                ON CONFLICT DO NOTHING;
            """);

            // J-7 : Mark Ronson, Beyoncé, Rihanna
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (92734438::bigint, 1), (2553265::bigint, 2), (925106::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 7
                ON CONFLICT DO NOTHING;
            """);

            // J-6 : JAY Z, Kendrick Lamar, Drake
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (676960::bigint, 1), (350171311::bigint, 2), (533609232::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 6
                ON CONFLICT DO NOTHING;
            """);

            // J-5 : PNL, Orelsan, Angèle
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (653159322::bigint, 1), (414838122::bigint, 2), (546875572::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 5
                ON CONFLICT DO NOTHING;
            """);

            // J-4 : Arctic Monkeys, Muse, Oasis
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (70322132::bigint, 1), (3590186::bigint, 2), (985745702::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 4
                ON CONFLICT DO NOTHING;
            """);

            // J-3 : Justice, Massive Attack, Chemical Brothers
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (10284909::bigint, 1), (3129748::bigint, 2), (3130293::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 3
                ON CONFLICT DO NOTHING;
            """);

            // J-2 : Daft Punk, Stromae, Coldplay
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (66609426::bigint, 1), (6297555::bigint, 2), (3128096::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 2
                ON CONFLICT DO NOTHING;
            """);

            // J-1 : Pharrell Williams, Amy Winehouse, Gorillaz
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (701326562::bigint, 1), (2176852::bigint, 2), (3129407::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE - 1
                ON CONFLICT DO NOTHING;
            """);

            // Aujourd'hui : Eminem, Radiohead (Creep), Billie Eilish
            migrationBuilder.Sql("""
                INSERT INTO "DailyChallengeTracks" ("DailyChallengeId", "TrackId", "Position", "DeezerRankSnapshot")
                SELECT dc."Id", t."Id", pos.pos, 0
                FROM "DailyChallenges" dc
                CROSS JOIN (VALUES (1109731::bigint, 1), (138547415::bigint, 2), (655095912::bigint, 3)) AS pos(deezer_id, pos)
                JOIN "Tracks" t ON t."DeezerTrackId" = pos.deezer_id
                WHERE dc."Date" = CURRENT_DATE
                ON CONFLICT DO NOTHING;
            """);

            // ── Player dev : streak 9, a joué J-9 à J-1 ────────────────────
            migrationBuilder.Sql("""
                INSERT INTO "Players" ("Id", "IsGuest", "Pseudo", "AuthToken", "CreatedAt", "CurrentStreak", "LastPlayedDate")
                VALUES (
                  'aaaaaaaa-0000-0000-0000-000000000001',
                  true,
                  NULL,
                  'bbbbbbbb-0000-0000-0000-000000000001',
                  NOW() AT TIME ZONE 'utc',
                  9,
                  CURRENT_DATE - 1
                )
                ON CONFLICT ("Id") DO NOTHING;
            """);

            // GameSessions J-9 à J-1 (Status sera mis à Completed dans la migration SessionStatus)
            migrationBuilder.Sql("""
                INSERT INTO "GameSessions" ("PlayerId", "DailyChallengeId", "TotalScore", "TotalDurationSeconds", "CreatedAt")
                SELECT
                  'aaaaaaaa-0000-0000-0000-000000000001',
                  dc."Id",
                  2550,
                  1.5,
                  (dc."Date"::timestamp AT TIME ZONE 'utc') + INTERVAL '12 hours'
                FROM "DailyChallenges" dc
                WHERE dc."Date" BETWEEN CURRENT_DATE - 9 AND CURRENT_DATE - 1
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
                    WHERE "Date" BETWEEN CURRENT_DATE - 9 AND CURRENT_DATE
                  );
                DELETE FROM "DailyChallenges" WHERE "Date" BETWEEN CURRENT_DATE - 9 AND CURRENT_DATE;
                DELETE FROM "Tracks" WHERE "DeezerTrackId" IN (
                  66609426, 6297555, 3128096, 701326562, 2176852, 3129407, 1109731, 138547415, 655095912,
                  4603408, 9997018, 13791930, 908604612, 8086126, 139470659, 92734438, 2553265,
                  925106, 969494, 1178682, 676960, 350171311, 533609232, 2783963122, 435821782,
                  653159322, 414838122, 546875572, 870857, 369711461,
                  70322132, 3590186, 461043312, 2525864, 985745702, 138539157, 3102130, 958109, 14914978, 676183,
                  103052662, 10284909, 3129748, 3130293, 62126191,
                  1124841682, 742744952, 797228462, 18190280, 2743578151
                );
            """);
        }
    }
}

-- Vérifications de l'import (§ 8.5 du plan v2), dans la même transaction que 10-import.sql : au
-- moindre écart, une exception annule tout. Rien de personnel dans les messages (S13).

-- Un contrôle = deux nombres qui doivent être égaux (le plus souvent : attendu, et trouvé en v2).
CREATE FUNCTION pg_temp.expect(label text, expected bigint, actual bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF expected IS DISTINCT FROM actual THEN
        RAISE EXCEPTION 'Vérification « % » : % attendu(s), % trouvé(s)', label, expected, actual;
    END IF;
END $$;

-- ============================================================================================
-- Players (PR B4)
-- ============================================================================================

-- Nombre de lignes
SELECT pg_temp.expect('joueurs',
    (SELECT count(*) FROM public."Players"), (SELECT count(*) FROM players.players));
SELECT pg_temp.expect('comptes (joueurs non invités)',
    (SELECT count(*) FROM public."Players" WHERE NOT "IsGuest"), (SELECT count(*) FROM players.accounts));
SELECT pg_temp.expect('jetons v1 (un par joueur)',
    (SELECT count(*) FROM public."Players"), (SELECT count(*) FROM players.legacy_tokens));
SELECT pg_temp.expect('clés Data Protection',
    (SELECT count(*) FROM public."DataProtectionKeys"), (SELECT count(*) FROM infra.data_protection_keys));
SELECT pg_temp.expect('jetons de connexion encore valables',
    (SELECT count(*) FROM public."MagicLinkTokens" WHERE "ConsumedAt" IS NULL AND "ExpiresAt" > now()),
    (SELECT count(*) FROM players.auth_tokens WHERE purpose = 1));
SELECT pg_temp.expect('jetons de changement d''email encore valables',
    (SELECT count(*) FROM public."EmailChangeTokens" WHERE "ConsumedAt" IS NULL AND "ExpiresAt" > now()),
    (SELECT count(*) FROM players.auth_tokens WHERE purpose = 2));

-- Jetons envoyés par email : même hash (hexadécimal v1 décodé), même adresse, mêmes dates.
SELECT pg_temp.expect('jetons de connexion repris à l''identique', 0, (
    SELECT count(*) FROM public."MagicLinkTokens" m
    LEFT JOIN players.auth_tokens t ON t.purpose = 1 AND t.token_hash = decode(m."TokenHash", 'hex')
    WHERE m."ConsumedAt" IS NULL AND m."ExpiresAt" > now()
      AND (t.id IS NULL
           OR t.email::text IS DISTINCT FROM m."Email"
           OR t.expires_at IS DISTINCT FROM m."ExpiresAt"
           OR t.created_at IS DISTINCT FROM m."CreatedAt")));
SELECT pg_temp.expect('jetons de changement d''email repris à l''identique', 0, (
    SELECT count(*) FROM public."EmailChangeTokens" e
    LEFT JOIN players.auth_tokens t ON t.purpose = 2 AND t.token_hash = decode(e."TokenHash", 'hex')
    WHERE e."ConsumedAt" IS NULL AND e."ExpiresAt" > now()
      AND (t.id IS NULL
           OR t.player_id IS DISTINCT FROM e."PlayerId"
           OR t.new_email::text IS DISTINCT FROM e."NewEmail"
           OR t.expires_at IS DISTINCT FROM e."ExpiresAt"
           OR t.created_at IS DISTINCT FROM e."CreatedAt")));

-- Joueurs : dates et suppression identiques (supprimé sans date : dernière visite ou création).
SELECT pg_temp.expect('joueurs repris à l''identique', 0, (
    SELECT count(*) FROM public."Players" p
    LEFT JOIN players.players v ON v.id = p."Id"
    WHERE v.id IS NULL
       OR v.created_at IS DISTINCT FROM p."CreatedAt"
       OR v.last_seen_at IS DISTINCT FROM p."LastSeenAt"
       OR v.deleted_at IS DISTINCT FROM
          CASE WHEN p."IsDeleted" THEN COALESCE(p."DeletedAt", p."LastSeenAt", p."CreatedAt") END));

-- Comptes : chaque email et chaque pseudo retrouvés à l'identique (casse comprise), rôle admin identique.
SELECT pg_temp.expect('comptes repris à l''identique', 0, (
    SELECT count(*) FROM public."Players" p
    LEFT JOIN players.accounts a ON a.player_id = p."Id"
    WHERE NOT p."IsGuest"
      AND (a.player_id IS NULL
           OR a.email::text IS DISTINCT FROM p."Email"
           OR a.pseudo::text IS DISTINCT FROM p."Pseudo"
           OR a.is_admin IS DISTINCT FROM p."IsAdmin")));
SELECT pg_temp.expect('aucun compte pour un invité', 0, (
    SELECT count(*) FROM public."Players" p
    JOIN players.accounts a ON a.player_id = p."Id"
    WHERE p."IsGuest"));

-- Jetons v1 : pour chaque joueur, sha256(AuthToken) présent, et rattaché à ce joueur.
SELECT pg_temp.expect('jetons v1 retrouvés', 0, (
    SELECT count(*) FROM public."Players" p
    LEFT JOIN players.legacy_tokens t
           ON t.player_id = p."Id" AND t.token_hash = sha256(convert_to(p."AuthToken"::text, 'UTF8'))
    WHERE t.player_id IS NULL));

-- Clés Data Protection copiées telles quelles.
SELECT pg_temp.expect('clés Data Protection identiques', 0, (
    SELECT count(*) FROM public."DataProtectionKeys" k
    LEFT JOIN infra.data_protection_keys v
           ON v.id = k."Id" AND v.friendly_name IS NOT DISTINCT FROM k."FriendlyName" AND v.xml IS NOT DISTINCT FROM k."Xml"
    WHERE v.id IS NULL));

-- ============================================================================================
-- Catalogue (PR C2)
-- ============================================================================================

-- Nombre de lignes
SELECT pg_temp.expect('morceaux',
    (SELECT count(*) FROM public."Tracks"), (SELECT count(*) FROM catalogue.tracks));
SELECT pg_temp.expect('identifiants Deezer distincts',
    (SELECT count(DISTINCT "DeezerTrackId") FROM public."Tracks"),
    (SELECT count(DISTINCT deezer_track_id) FROM catalogue.tracks));

-- Morceaux : identifiant, noms, pochette, année et dates repris à l'identique (année inférieure à 1 → NULL).
SELECT pg_temp.expect('morceaux repris à l''identique', 0, (
    SELECT count(*) FROM public."Tracks" t
    LEFT JOIN catalogue.tracks v ON v.id = t."Id"
    WHERE v.id IS NULL
       OR v.deezer_track_id IS DISTINCT FROM t."DeezerTrackId"
       OR v.artist IS DISTINCT FROM t."Artist"
       OR v.title IS DISTINCT FROM t."Title"
       OR v.cover_hash IS DISTINCT FROM t."CoverHash"
       OR v.release_year::int IS DISTINCT FROM CASE WHEN t."ReleaseYear" >= 1 THEN t."ReleaseYear" END
       OR v.created_at IS DISTINCT FROM t."CreatedAt"
       OR v.updated_at IS DISTINCT FROM t."UpdatedAt"));

-- Extrait : HasPreview devient disponible (1) ou absent (2), jamais inconnu ; rang et contrôle inconnus.
SELECT pg_temp.expect('état de l''extrait', 0, (
    SELECT count(*) FROM public."Tracks" t
    JOIN catalogue.tracks v ON v.id = t."Id"
    WHERE v.preview_status IS DISTINCT FROM CASE WHEN t."HasPreview" THEN 1 ELSE 2 END
       OR v.preview_checked_at IS NOT NULL
       OR v.deezer_rank IS NOT NULL
       OR v.rank_updated_at IS NOT NULL));

-- Désactivation : même ensemble de morceaux désactivés, avec la dernière modification pour date quand elle existe.
SELECT pg_temp.expect('morceaux désactivés', 0, (
    SELECT count(*) FROM public."Tracks" t
    JOIN catalogue.tracks v ON v.id = t."Id"
    WHERE (v.disabled_at IS NOT NULL) IS DISTINCT FROM t."IsDisabled"
       OR (t."IsDisabled" AND t."UpdatedAt" IS NOT NULL AND v.disabled_at IS DISTINCT FROM t."UpdatedAt")));

-- Séquence : le prochain lot d'identifiants commence au-delà du plus grand identifiant repris.
SELECT pg_temp.expect('séquence des identifiants de morceaux', 1, (
    SELECT CASE WHEN (SELECT CASE WHEN is_called THEN last_value + 10 ELSE last_value END FROM catalogue.tracks_hilo)
                    > COALESCE((SELECT max(id) FROM catalogue.tracks), 0) THEN 1 ELSE 0 END));

-- ============================================================================================
-- Daily (PR E4)
-- ============================================================================================

-- Nombre de lignes. Les séries : un joueur en a une s'il a une série, une date ou un gel.
SELECT pg_temp.expect('défis',
    (SELECT count(*) FROM public."DailyChallenges"), (SELECT count(*) FROM daily.challenges));
SELECT pg_temp.expect('morceaux des défis',
    (SELECT count(*) FROM public."DailyChallengeTracks"), (SELECT count(*) FROM daily.challenge_tracks));
SELECT pg_temp.expect('parties',
    (SELECT count(*) FROM public."GameSessions"), (SELECT count(*) FROM daily.sessions));
SELECT pg_temp.expect('réponses',
    (SELECT count(*) FROM public."GameSessionAnswers"), (SELECT count(*) FROM daily.answers));
SELECT pg_temp.expect('séries',
    (SELECT count(*) FROM public."Players" WHERE "CurrentStreak" <> 0 OR "LastPlayedDate" IS NOT NULL OR "StreakFreezes" <> 0),
    (SELECT count(*) FROM daily.streaks));

-- Défis : identifiant, date et graine à l'identique, origine inconnue.
SELECT pg_temp.expect('défis repris à l''identique', 0, (
    SELECT count(*) FROM public."DailyChallenges" c
    LEFT JOIN daily.challenges v ON v.id = c."Id"
    WHERE v.id IS NULL OR v.date IS DISTINCT FROM c."Date" OR v.seed IS DISTINCT FROM c."Seed" OR v.origin IS NOT NULL));

-- Morceaux des défis : même morceau à la même position dans le même défi.
SELECT pg_temp.expect('morceaux des défis repris à l''identique', 0, (
    SELECT count(*) FROM public."DailyChallengeTracks" t
    LEFT JOIN daily.challenge_tracks v ON v.challenge_id = t."DailyChallengeId" AND v.position = t."Position"
    WHERE v.challenge_id IS NULL OR v.track_id IS DISTINCT FROM t."TrackId"));

-- Rang Deezer figé (DeezerRankSnapshot) : abandonné. La v1 ne le lisait nulle part ; elle y écrit la position depuis la mi-septembre
-- 2026, mais les défis plus anciens portent une autre valeur (la prod en a 210 lignes au 8 octobre). Un écart ne bloque pas l'import
-- : il est compté, avec les défis concernés.
DO $$
DECLARE
    gaps bigint;
    challenges text;
BEGIN
    SELECT count(*), string_agg(DISTINCT "DailyChallengeId"::text, ', ') INTO gaps, challenges
    FROM public."DailyChallengeTracks" WHERE "DeezerRankSnapshot" <> "Position";
    RAISE NOTICE 'Morceaux de défi dont le rang Deezer figé diffère de la position, abandonné (non bloquant) : %', gaps;
    IF challenges IS NOT NULL THEN
        RAISE NOTICE 'Rang Deezer figé abandonné, défis : %', challenges;
    END IF;
END $$;

-- Parties : tout à l'identique, sauf le statut d'une partie en cours qui ne se reprendrait pas (réponses non contiguës, ou aucun
-- morceau à jouer, ou défi plus vieux que la veille), reprise « expirée » ; et le verrou, gardé seulement s'il porte sur le morceau en cours d'une partie qui reste
-- en cours, ou sur un morceau du défi d'une partie qui n'est plus en cours. Recalculé ici sur les réponses de la v2.
SELECT pg_temp.expect('parties reprises à l''identique', 0, (
    WITH answered AS (
        SELECT session_id, count(*) AS n, max(position) AS last_position FROM daily.answers GROUP BY session_id),
    expected AS (
        SELECT s."Id" AS id, s."PlayerId", s."DailyChallengeId", s."Status", s."CreatedAt", s."CompletedAt", s."AbandonedAt",
               s."TotalScore", s."TotalDurationSeconds", s."CurrentTrackMinListenedSeconds", s."CurrentTrackHintLevelUsed",
               s."FreezesUsed", s."FreezeEarned",
               COALESCE(a.n, 0) AS n, COALESCE(a.last_position, 0) AS last_position,
               (SELECT count(*) FROM daily.challenge_tracks t WHERE t.challenge_id = s."DailyChallengeId") AS tracks,
               lk."Position" AS lock_position,
               dc."Date" AS challenge_date
        FROM public."GameSessions" s
        JOIN public."DailyChallenges" dc ON dc."Id" = s."DailyChallengeId"
        LEFT JOIN answered a ON a.session_id = s."Id"
        LEFT JOIN public."DailyChallengeTracks" lk ON lk."Id" = s."CurrentTrackId" AND lk."DailyChallengeId" = s."DailyChallengeId"),
    flagged AS (
        SELECT e.*,
               e."Status" = 0 AND (NOT (e.last_position = e.n AND e.n < e.tracks)
                                   OR e.challenge_date < (now() AT TIME ZONE 'UTC')::date - 1) AS expire
        FROM expected e),
    resolved AS (
        SELECT f.*,
               CASE WHEN f.lock_position IS NOT NULL AND (f."Status" <> 0 OR (NOT f.expire AND f.lock_position = f.n + 1))
                    THEN f.lock_position END AS kept_position
        FROM flagged f)
    SELECT count(*) FROM resolved r
    LEFT JOIN daily.sessions v ON v.id = r.id
    WHERE v.id IS NULL
       OR v.player_id IS DISTINCT FROM r."PlayerId"
       OR v.challenge_id IS DISTINCT FROM r."DailyChallengeId"
       OR v.status::int IS DISTINCT FROM CASE WHEN r.expire THEN 3 ELSE r."Status" END
       OR v.started_at IS DISTINCT FROM r."CreatedAt"
       -- now() : l'heure de la transaction, celle de l'import (même transaction, run-import.sh).
       OR v.ended_at IS DISTINCT FROM CASE WHEN r.expire THEN now() ELSE COALESCE(r."CompletedAt", r."AbandonedAt") END
       OR v.total_score IS DISTINCT FROM r."TotalScore"
       OR v.total_listened_seconds IS DISTINCT FROM r."TotalDurationSeconds"
       OR v.current_position::int IS DISTINCT FROM r.kept_position
       OR v.current_listened_seconds IS DISTINCT FROM CASE WHEN r.kept_position IS NOT NULL THEN r."CurrentTrackMinListenedSeconds" END
       OR v.current_hint_level::int IS DISTINCT FROM CASE WHEN r.kept_position IS NOT NULL THEN r."CurrentTrackHintLevelUsed" ELSE 0 END
       OR v.freezes_used::int IS DISTINCT FROM r."FreezesUsed"
       OR v.freeze_earned IS DISTINCT FROM r."FreezeEarned"));

-- Parties en cours : chacune se reprend (défi de la veille ou du jour, réponses de 1 à N sans trou, un morceau à jouer) et son verrou,
-- s'il y en a un, est celui du morceau en cours.
SELECT pg_temp.expect('parties en cours reprenables, verrou sur le morceau en cours', 0, (
    SELECT count(*) FROM daily.sessions s
    JOIN daily.challenges c ON c.id = s.challenge_id
    LEFT JOIN (SELECT session_id, count(*) AS n, max(position) AS last_position FROM daily.answers GROUP BY session_id) a ON a.session_id = s.id
    WHERE s.status = 0
      AND (c.date < (now() AT TIME ZONE 'UTC')::date - 1
           OR COALESCE(a.last_position, 0) <> COALESCE(a.n, 0)
           OR COALESCE(a.n, 0) >= (SELECT count(*) FROM daily.challenge_tracks t WHERE t.challenge_id = s.challenge_id)
           OR (s.current_position IS NOT NULL AND s.current_position <> COALESCE(a.n, 0) + 1))));

-- Réponses : chacune retrouvée à la position de son morceau, tous les champs à l'identique, l'heure inconnue.
SELECT pg_temp.expect('réponses reprises à l''identique', 0, (
    SELECT count(*) FROM public."GameSessionAnswers" a
    JOIN public."DailyChallengeTracks" ct ON ct."Id" = a."DailyChallengeTrackId"
    LEFT JOIN daily.answers v ON v.session_id = a."GameSessionId" AND v.position = ct."Position"
    WHERE v.session_id IS NULL
       OR v.listened_seconds IS DISTINCT FROM a."ListenedDurationSeconds"
       OR v.was_extended IS DISTINCT FROM a."WasExtended"
       OR v.hint_level::int IS DISTINCT FROM a."HintLevelUsed"
       OR v.artist_answer IS DISTINCT FROM a."ArtistAnswer"
       OR v.title_answer IS DISTINCT FROM a."TitleAnswer"
       OR v.artist_correct IS DISTINCT FROM a."ArtistCorrect"
       OR v.title_correct IS DISTINCT FROM a."TitleCorrect"
       OR v.score IS DISTINCT FROM a."Score"
       OR v.answered_at IS NOT NULL));

-- Intégrité : une réponse porte sur un morceau du défi de sa partie.
SELECT pg_temp.expect('réponses sur un morceau du défi de leur partie', 0, (
    SELECT count(*) FROM daily.answers a
    JOIN daily.sessions s ON s.id = a.session_id
    LEFT JOIN daily.challenge_tracks t ON t.challenge_id = s.challenge_id AND t.position = a.position
    WHERE t.challenge_id IS NULL));

-- Scores : la somme par défi et par joueur est celle de la v1, et chaque partie terminée vaut la somme de ses réponses.
SELECT pg_temp.expect('scores par défi', 0, (
    SELECT count(*) FROM (SELECT "DailyChallengeId" AS id, sum("TotalScore") AS total FROM public."GameSessions" GROUP BY 1) o
    FULL JOIN (SELECT challenge_id AS id, sum(total_score) AS total FROM daily.sessions GROUP BY 1) v ON v.id = o.id
    WHERE o.id IS NULL OR v.id IS NULL OR o.total IS DISTINCT FROM v.total));
SELECT pg_temp.expect('scores par joueur', 0, (
    SELECT count(*) FROM (SELECT "PlayerId" AS id, sum("TotalScore") AS total FROM public."GameSessions" GROUP BY 1) o
    FULL JOIN (SELECT player_id AS id, sum(total_score) AS total FROM daily.sessions GROUP BY 1) v ON v.id = o.id
    WHERE o.id IS NULL OR v.id IS NULL OR o.total IS DISTINCT FROM v.total));
SELECT pg_temp.expect('score d''une partie terminée = somme de ses réponses', 0, (
    SELECT count(*) FROM daily.sessions s
    WHERE s.status = 1 AND s.total_score <> COALESCE((SELECT sum(a.score) FROM daily.answers a WHERE a.session_id = s.id), 0)));

-- Séries : pour chaque joueur, les trois valeurs brutes à l'identique (pas de ligne = rien à reprendre).
SELECT pg_temp.expect('séries reprises à l''identique', 0, (
    SELECT count(*) FROM public."Players" p
    LEFT JOIN daily.streaks v ON v.player_id = p."Id"
    WHERE COALESCE(v.current_streak, 0) <> p."CurrentStreak"
       OR v.last_played_date IS DISTINCT FROM p."LastPlayedDate"
       OR COALESCE(v.freezes, 0) <> p."StreakFreezes"));

-- Cooldown : la dernière date et le nombre d'utilisations des morceaux, que la v2 recalcule depuis les défis, comparés à ce que la v1
-- stockait. Un écart ne bloque pas l'import (décision de Clément, revue de E4) : la v2 ne lit que les défis, qui sont repris tels quels ;
-- seule la v1 tenait ces compteurs, et sa route de création de défi à la main ne les mettait pas à jour. Les morceaux sont listés.
DO $$
DECLARE
    gaps bigint;
    ids text;
BEGIN
    SELECT count(*), string_agg(t."Id"::text, ', ' ORDER BY t."Id") INTO gaps, ids FROM public."Tracks" t
    LEFT JOIN (SELECT ct.track_id, max(c.date) AS last_used, count(*) AS uses
               FROM daily.challenge_tracks ct JOIN daily.challenges c ON c.id = ct.challenge_id GROUP BY ct.track_id) u ON u.track_id = t."Id"
    WHERE t."LastUsedDate" IS DISTINCT FROM u.last_used OR t."UsageCount" <> COALESCE(u.uses, 0);
    RAISE NOTICE 'Morceaux dont le cooldown de la v1 diffère du calcul sur les défis (non bloquant) : %', gaps;
    IF ids IS NOT NULL THEN
        RAISE NOTICE 'Écart de cooldown, morceaux : %', ids;
    END IF;
END $$;

-- Séquences : le prochain lot d'identifiants commence au-delà du plus grand identifiant repris.
SELECT pg_temp.expect('séquence des identifiants de défis', 1, (
    SELECT CASE WHEN (SELECT CASE WHEN is_called THEN last_value + 10 ELSE last_value END FROM daily.challenges_hilo)
                    > COALESCE((SELECT max(id) FROM daily.challenges), 0) THEN 1 ELSE 0 END));
SELECT pg_temp.expect('séquence des identifiants de parties', 1, (
    SELECT CASE WHEN (SELECT CASE WHEN is_called THEN last_value + 10 ELSE last_value END FROM daily.sessions_hilo)
                    > COALESCE((SELECT max(id) FROM daily.sessions), 0) THEN 1 ELSE 0 END));

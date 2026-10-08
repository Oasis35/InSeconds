-- Import des données v1 (schéma public) dans les schémas v2 (§ 8.2 du plan v2).
-- Lancé par run-import.sh, dans la même transaction que 20-verify.sql. Rejouable : chaque partie
-- vide d'abord les tables qu'elle remplit. Construit module par module (DEVELOPPEMENT.md) ; chaque
-- partie a ses contrôles dans 20-verify.sql et ses tests dans InSeconds.MigrationTests.
-- Rien de personnel dans les messages (S13) : des nombres et des identifiants, jamais d'email ni de pseudo.

-- ============================================================================================
-- Players (PR B4) : joueurs, comptes, jetons v1 (pour reprendre les cookies), jetons envoyés par
-- email encore valables, et clés Data Protection (sans elles, aucun cookie v1 ne se déchiffre).
-- ============================================================================================

-- Pré-contrôles : ce que les contraintes v2 refuseraient, avec un message clair plutôt qu'une
-- erreur de contrainte.
DO $$
DECLARE
    ids text;
BEGIN
    -- Pseudos uniques sans tenir compte de la casse en v2 (citext), en la respectant en v1 (R5).
    SELECT string_agg(p."Id"::text, ', ' ORDER BY p."Id") INTO ids
    FROM public."Players" p
    WHERE NOT p."IsGuest"
      AND lower(p."Pseudo") IN (
          SELECT lower("Pseudo") FROM public."Players" WHERE NOT "IsGuest"
          GROUP BY lower("Pseudo") HAVING count(*) > 1);
    IF ids IS NOT NULL THEN
        RAISE EXCEPTION 'Pseudos en doublon de casse (« Bob » et « bob ») à régler avant l''import, joueurs : %', ids;
    END IF;

    -- Même chose pour les adresses : l'index unique de la v1 respecte la casse, celui de la v2 (citext) non.
    SELECT string_agg(p."Id"::text, ', ' ORDER BY p."Id") INTO ids
    FROM public."Players" p
    WHERE NOT p."IsGuest"
      AND lower(p."Email") IN (
          SELECT lower("Email") FROM public."Players" WHERE NOT "IsGuest" AND "Email" IS NOT NULL
          GROUP BY lower("Email") HAVING count(*) > 1);
    IF ids IS NOT NULL THEN
        RAISE EXCEPTION 'Adresses email en doublon de casse à régler avant l''import, joueurs : %', ids;
    END IF;

    -- Un compte v2 a toujours une adresse.
    SELECT string_agg("Id"::text, ', ' ORDER BY "Id") INTO ids
    FROM public."Players" WHERE NOT "IsGuest" AND "Email" IS NULL;
    IF ids IS NOT NULL THEN
        RAISE EXCEPTION 'Comptes v1 sans adresse email, joueurs : %', ids;
    END IF;
END $$;

-- Les tables d'un module qui référencent players.players s'ajoutent à cette liste avec leur import. Les parties et les
-- séries de Daily (E2) en font partie : sur le staging, les joueurs jouent, et PostgreSQL refuse de vider les joueurs tant
-- que ces tables, qui les référencent, ne partent pas avec (leur historique est repris plus bas, par l'import de Daily, E4).
TRUNCATE daily.answers,
         daily.sessions,
         daily.streaks,
         players.device_sessions,
         players.legacy_tokens,
         players.auth_tokens,
         players.accounts,
         players.players,
         infra.data_protection_keys
    RESTART IDENTITY;

-- Supprimé sans date de suppression : la dernière date connue, jamais une date inventée (R16).
INSERT INTO players.players (id, created_at, last_seen_at, deleted_at)
SELECT "Id", "CreatedAt", "LastSeenAt",
       CASE WHEN "IsDeleted" THEN COALESCE("DeletedAt", "LastSeenAt", "CreatedAt") END
FROM public."Players";

DO $$
DECLARE
    n bigint;
BEGIN
    SELECT count(*) INTO n FROM public."Players" WHERE "IsDeleted" AND "DeletedAt" IS NULL;
    RAISE NOTICE 'Joueurs supprimés sans date de suppression (date = dernière visite ou création) : %', n;
END $$;

-- Un compte par joueur non invité ; date de création du compte inconnue en v1.
INSERT INTO players.accounts (player_id, email, pseudo, is_admin, linked_at)
SELECT "Id", "Email", "Pseudo", "IsAdmin", NULL
FROM public."Players"
WHERE NOT "IsGuest";

-- Un jeton v1 par joueur, haché comme LegacyToken.HashOf (Guid en minuscules avec tirets, UTF-8) :
-- chaque appareil qui présente un cookie v1 obtient sa propre session à sa première visite (R1).
INSERT INTO players.legacy_tokens (player_id, token_hash)
SELECT "Id", sha256(convert_to("AuthToken"::text, 'UTF8'))
FROM public."Players";

-- Seuls les jetons encore utilisables ; le hash v1 est en hexadécimal (R14).
INSERT INTO players.auth_tokens (purpose, email, token_hash, expires_at, created_at)
SELECT 1, "Email", decode("TokenHash", 'hex'), "ExpiresAt", "CreatedAt"
FROM public."MagicLinkTokens"
WHERE "ConsumedAt" IS NULL AND "ExpiresAt" > now();

INSERT INTO players.auth_tokens (purpose, player_id, new_email, token_hash, expires_at, created_at)
SELECT 2, "PlayerId", "NewEmail", decode("TokenHash", 'hex'), "ExpiresAt", "CreatedAt"
FROM public."EmailChangeTokens"
WHERE "ConsumedAt" IS NULL AND "ExpiresAt" > now();

-- Copiées obligatoirement, identifiants compris, puis séquence remise à niveau.
INSERT INTO infra.data_protection_keys (id, friendly_name, xml)
SELECT "Id", "FriendlyName", "Xml"
FROM public."DataProtectionKeys";

SELECT setval(pg_get_serial_sequence('infra.data_protection_keys', 'id'),
              COALESCE(max(id), 1), max(id) IS NOT NULL)
FROM infra.data_protection_keys;

-- ============================================================================================
-- Catalogue (PR C2) : les morceaux du pool, identifiants compris (un défi ou une réponse les
-- référencera). L'usage (LastUsedDate, UsageCount) n'est pas repris : il se recalcule depuis les
-- défis, et sa vérification vient avec l'import de Daily.
-- ============================================================================================

-- Une année au-delà de la plage de la colonne v2 (smallint) ferait échouer l'insertion sans dire quel morceau.
-- (Les années inférieures à 1 ne posent pas de problème : elles deviennent NULL, voir plus bas.)
DO $$
DECLARE
    ids text;
BEGIN
    SELECT string_agg("Id"::text, ', ' ORDER BY "Id") INTO ids
    FROM public."Tracks" WHERE "ReleaseYear" > 32767;
    IF ids IS NOT NULL THEN
        RAISE EXCEPTION 'Morceaux v1 dont l''année de sortie est hors limites, morceaux : %', ids;
    END IF;
END $$;

-- Les tables d'un module qui référencent catalogue.tracks s'ajoutent à cette liste avec leur import : PostgreSQL
-- refuse de vider une table référencée par une clé étrangère, même vide. Les défis (E1) en font partie : le défi
-- que la tâche de minuit a généré sur la base de staging, avant un nouvel import, part avec les morceaux (leur
-- historique est repris plus bas, par l'import de Daily, E4). Les parties référencent les défis : elles sont déjà vides (premier
-- TRUNCATE), mais PostgreSQL les veut dans la même commande. Les photos figées des jours (E3) référencent les défis : elles partent avec eux,
-- et sont recalculées pour tous les jours passés après l'import (E4, `--freeze-day-stats`).
TRUNCATE daily.challenge_day_stats, daily.answers, daily.sessions, daily.challenge_tracks, daily.challenges, catalogue.tracks RESTART IDENTITY;

-- HasPreview vaut 1 (disponible) ou 2 (absent) : l'état « inconnu » n'existe pas en v1. Le rang Deezer et
-- la date du dernier contrôle sont inconnus : la tâche catalogue-refresh les remplit la nuit suivante (en
-- staging, où elle ne tourne pas, au bouton « Re-vérifier les previews »).
-- Année inférieure à 1 (Deezer renvoie parfois « 0000-00-00 », que la v1 enregistrait en 0) : NULL, comme le
-- client Deezer de la v2, pour que l'indice « année » n'affiche jamais 0.
-- Désactivé sans date en v1 : la dernière modification, à défaut maintenant (la date de la désactivation
-- n'a jamais été conservée, jamais une date inventée plus ancienne).
INSERT INTO catalogue.tracks (id, deezer_track_id, artist, title, cover_hash, release_year, deezer_rank,
    rank_updated_at, preview_status, preview_checked_at, disabled_at, created_at, updated_at)
SELECT "Id", "DeezerTrackId", "Artist", "Title", "CoverHash",
       CASE WHEN "ReleaseYear" >= 1 THEN "ReleaseYear" END, NULL,
       NULL, CASE WHEN "HasPreview" THEN 1 ELSE 2 END, NULL,
       CASE WHEN "IsDisabled" THEN COALESCE("UpdatedAt", now()) END,
       "CreatedAt", "UpdatedAt"
FROM public."Tracks";

-- Identifiants tirés d'une séquence HiLo en v2 (lots de 10) : le prochain lot commence après le plus grand
-- identifiant repris, sans quoi le premier morceau ajouté en v2 prendrait celui d'un morceau de la v1.
SELECT setval('catalogue.tracks_hilo', COALESCE(max(id), 0) + 1, false)
FROM catalogue.tracks;

-- ============================================================================================
-- Daily (PR E4) : les défis et leurs morceaux, les parties, les réponses et les séries, identifiants
-- compris. Les joueurs et les morceaux sont déjà là (parties précédentes). Les photos figées des jours
-- passés ne sont pas dans ce script : elles se calculent après l'import, par `--freeze-day-stats`.
-- ============================================================================================

-- Pré-contrôles : ce que les contraintes et les colonnes v2 refuseraient, avec un message clair plutôt
-- qu'une erreur de contrainte sans la ligne en cause. Seulement des identifiants dans les messages.
DO $$
DECLARE
    ids text;
BEGIN
    -- Une réponse rattachée à un morceau d'un autre défi que celui de sa partie : sa position n'aurait aucun sens.
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO ids FROM (
        SELECT DISTINCT a."GameSessionId" AS id
        FROM public."GameSessionAnswers" a
        JOIN public."GameSessions" s ON s."Id" = a."GameSessionId"
        JOIN public."DailyChallengeTracks" ct ON ct."Id" = a."DailyChallengeTrackId"
        WHERE ct."DailyChallengeId" <> s."DailyChallengeId") x;
    IF ids IS NOT NULL THEN
        RAISE EXCEPTION 'Réponses sur un morceau d''un autre défi que celui de leur partie, parties : %', ids;
    END IF;

    -- Les colonnes v2 sont numeric(4,2) (durée d'une réponse, durée du verrou) et numeric(6,2) (total) : une valeur
    -- au-delà, ou avec plus de deux décimales, serait arrondie ou refusée sans dire laquelle.
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO ids FROM (
        SELECT DISTINCT a."GameSessionId" AS id FROM public."GameSessionAnswers" a
        WHERE a."ListenedDurationSeconds" < 0 OR a."ListenedDurationSeconds" >= 100
           OR round(a."ListenedDurationSeconds", 2) <> a."ListenedDurationSeconds"
           OR a."HintLevelUsed" NOT BETWEEN 0 AND 32767
        UNION
        SELECT s."Id" FROM public."GameSessions" s
        WHERE s."TotalDurationSeconds" < 0 OR s."TotalDurationSeconds" >= 10000
           OR round(s."TotalDurationSeconds", 2) <> s."TotalDurationSeconds"
           OR s."CurrentTrackMinListenedSeconds" < 0 OR s."CurrentTrackMinListenedSeconds" >= 100
           OR round(s."CurrentTrackMinListenedSeconds", 2) <> s."CurrentTrackMinListenedSeconds"
           OR s."CurrentTrackHintLevelUsed" NOT BETWEEN 0 AND 32767
           OR s."FreezesUsed" NOT BETWEEN 0 AND 32767
           OR s."Status" NOT BETWEEN 0 AND 3) x;
    IF ids IS NOT NULL THEN
        RAISE EXCEPTION 'Durées, niveaux d''indice, gels ou statuts hors des limites des colonnes v2, parties : %', ids;
    END IF;

    SELECT string_agg(ct."Id"::text, ', ' ORDER BY ct."Id") INTO ids
    FROM public."DailyChallengeTracks" ct WHERE ct."Position" NOT BETWEEN 1 AND 32767;
    IF ids IS NOT NULL THEN
        RAISE EXCEPTION 'Positions de morceaux de défi hors limites, lignes : %', ids;
    END IF;

    SELECT string_agg("Id"::text, ', ' ORDER BY "Id") INTO ids
    FROM public."Players" WHERE "StreakFreezes" NOT BETWEEN 0 AND 32767;
    IF ids IS NOT NULL THEN
        RAISE EXCEPTION 'Gels de série hors limites, joueurs : %', ids;
    END IF;
END $$;

-- Les défis, la date et la graine à l'identique ; l'origine (nocturne, à la volée, admin) n'a jamais été notée en v1.
INSERT INTO daily.challenges (id, date, seed, origin)
SELECT "Id", "Date", "Seed", NULL
FROM public."DailyChallenges";

-- La clé d'un morceau du défi n'est plus son identifiant v1 mais (défi, position). DeezerRankSnapshot (qui vaut la position
-- partout, vérifié) est abandonné.
INSERT INTO daily.challenge_tracks (challenge_id, position, track_id)
SELECT "DailyChallengeId", "Position", "TrackId"
FROM public."DailyChallengeTracks";

-- Le plan des parties : ce que l'import en fait. Une partie en cours ne se reprend en v2 que si ses réponses vont de 1 à N,
-- sans trou, avec au moins un morceau à jouer (« le morceau en cours est le premier sans réponse », piège 35 : la v1 n'imposait
-- l'ordre que si le verrou était posé). Sinon elle passe en « expirée » (ses réponses sont gardées). Le verrou d'un morceau (durée
-- écoutée, indice) n'est gardé que s'il porte sur le morceau en cours ; ailleurs la v2 l'ignorerait de toute façon.
DROP TABLE IF EXISTS pg_temp.import_session_plan;
CREATE TEMP TABLE import_session_plan AS
SELECT s."Id" AS session_id,
       s."Status" AS status,
       count(a."Id") AS answered,
       COALESCE(max(ct."Position"), 0) AS last_position,
       (SELECT count(*) FROM public."DailyChallengeTracks" t WHERE t."DailyChallengeId" = s."DailyChallengeId") AS tracks,
       lk."Position" AS lock_position,
       s."CurrentTrackId" IS NOT NULL AS has_lock
FROM public."GameSessions" s
LEFT JOIN public."GameSessionAnswers" a ON a."GameSessionId" = s."Id"
LEFT JOIN public."DailyChallengeTracks" ct ON ct."Id" = a."DailyChallengeTrackId"
LEFT JOIN public."DailyChallengeTracks" lk ON lk."Id" = s."CurrentTrackId" AND lk."DailyChallengeId" = s."DailyChallengeId"
GROUP BY s."Id", lk."Position";

ALTER TABLE import_session_plan ADD COLUMN expire boolean, ADD COLUMN keep_lock boolean;
UPDATE import_session_plan
SET expire = (status = 0 AND NOT (last_position = answered AND answered < tracks));
UPDATE import_session_plan
SET keep_lock = (lock_position IS NOT NULL AND (status <> 0 OR (NOT expire AND lock_position = answered + 1)));

DO $$
DECLARE
    expired bigint;
    dropped bigint;
    ids text;
BEGIN
    SELECT count(*) INTO expired FROM import_session_plan WHERE expire;
    SELECT count(*) INTO dropped FROM import_session_plan WHERE has_lock AND NOT keep_lock;
    RAISE NOTICE 'Parties en cours aux réponses non contiguës, reprises en « expirées » : %', expired;
    -- Les identifiants, pour décider avant la bascule : une partie du jour expirée, c'est une partie du jour perdue pour son joueur.
    SELECT string_agg(session_id::text, ', ' ORDER BY session_id) INTO ids FROM import_session_plan WHERE expire;
    IF ids IS NOT NULL THEN
        RAISE NOTICE 'Parties reprises en « expirées », identifiants : %', ids;
    END IF;
    RAISE NOTICE 'Verrous de morceau écartés (hors du défi, ou pas sur le morceau en cours) : %', dropped;
END $$;

-- started_at = création ; ended_at = fin ou abandon (vide pour une partie en cours) ; le verrou de la v1 (un identifiant de
-- morceau du défi) devient la position du morceau dans le même défi.
INSERT INTO daily.sessions (id, player_id, challenge_id, status, started_at, ended_at, total_score, total_listened_seconds,
    current_position, current_listened_seconds, current_hint_level, freezes_used, freeze_earned)
SELECT s."Id", s."PlayerId", s."DailyChallengeId",
       CASE WHEN p.expire THEN 3 ELSE s."Status" END,
       s."CreatedAt", COALESCE(s."CompletedAt", s."AbandonedAt"),
       s."TotalScore", s."TotalDurationSeconds",
       CASE WHEN p.keep_lock THEN p.lock_position END,
       CASE WHEN p.keep_lock THEN s."CurrentTrackMinListenedSeconds" END,
       CASE WHEN p.keep_lock THEN s."CurrentTrackHintLevelUsed" ELSE 0 END,
       s."FreezesUsed", s."FreezeEarned"
FROM public."GameSessions" s
JOIN import_session_plan p ON p.session_id = s."Id";

-- Une réponse est rangée par (partie, position du morceau) ; l'heure de la réponse n'existait pas en v1.
INSERT INTO daily.answers (session_id, position, listened_seconds, was_extended, hint_level, artist_answer, title_answer,
    artist_correct, title_correct, score, answered_at)
SELECT a."GameSessionId", ct."Position", a."ListenedDurationSeconds", a."WasExtended", a."HintLevelUsed",
       a."ArtistAnswer", a."TitleAnswer", a."ArtistCorrect", a."TitleCorrect", a."Score", NULL
FROM public."GameSessionAnswers" a
JOIN public."DailyChallengeTracks" ct ON ct."Id" = a."DailyChallengeTrackId";

-- La série sort du joueur : une ligne pour qui a une série, une date ou un gel, valeurs brutes (la série effective se calcule à la lecture).
INSERT INTO daily.streaks (player_id, current_streak, last_played_date, freezes)
SELECT "Id", "CurrentStreak", "LastPlayedDate", "StreakFreezes"
FROM public."Players"
WHERE "CurrentStreak" <> 0 OR "LastPlayedDate" IS NOT NULL OR "StreakFreezes" <> 0;

-- Identifiants tirés d'une séquence HiLo en v2 (lots de 10), comme pour les morceaux : le prochain lot commence après le plus grand
-- identifiant repris, sans quoi la première partie ou le premier défi créés en v2 prendraient celui d'une ligne de la v1.
SELECT setval('daily.challenges_hilo', COALESCE(max(id), 0) + 1, false) FROM daily.challenges;
SELECT setval('daily.sessions_hilo', COALESCE(max(id), 0) + 1, false) FROM daily.sessions;

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
-- que ces tables, qui les référencent, ne partent pas avec (leur historique est repris par l'import de Daily, E4).
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
-- historique est repris par l'import de Daily, E4). Les parties référencent les défis : elles sont déjà vides (premier
-- TRUNCATE), mais PostgreSQL les veut dans la même commande.
TRUNCATE daily.answers, daily.sessions, daily.challenge_tracks, daily.challenges, catalogue.tracks RESTART IDENTITY;

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

-- Suppression des tables v1 du schéma public (PR I1, #235), une fois la v2 ouverte aux joueurs.
-- Lancé par deploy/vps/drop-v1-tables.sh, qui archive d'abord une sauvegarde de la prod (backup.sh archive) :
--   psql --no-psqlrc -v ON_ERROR_STOP=1 -f deploy/migration-v2/drop-v1-tables.sql
-- Une seule transaction. Ne supprime que les tables que l'import connaît (05-check-source.sql) : une table inconnue
-- arrête tout, rien n'est supprimé. Rejouable : sans table v1, ne fait rien.
-- Après ce script, l'import v1 → v2 (run-import.sh) et le retour arrière de la bascule ne sont plus possibles.
BEGIN;

DO $$
DECLARE
    opened timestamptz;
    unknown text;
BEGIN
    -- Garde : jamais avant l'ouverture de la v2 (mark-opened.sql), les tables v1 sont alors la seule copie des données.
    IF to_regclass('infra.import_state') IS NOT NULL THEN
        EXECUTE 'SELECT opened_at FROM infra.import_state WHERE id = 1' INTO opened;
    END IF;
    IF opened IS NULL THEN
        RAISE EXCEPTION 'La v2 n''est pas notée ouverte (infra.import_state.opened_at) : tables v1 gardées.';
    END IF;

    SELECT string_agg(format('%I', c.relname), ', ' ORDER BY c.relname) INTO unknown
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND c.relname NOT IN ('__EFMigrationsHistory', 'Players', 'MagicLinkTokens', 'EmailChangeTokens',
                            'DataProtectionKeys', 'Settings', 'Tracks', 'DailyChallenges', 'DailyChallengeTracks',
                            'GameSessions', 'GameSessionAnswers');
    IF unknown IS NOT NULL THEN
        RAISE EXCEPTION 'Objets inconnus dans public : %. Rien n''est supprimé.', unknown;
    END IF;
END $$;

-- Ordre des clés étrangères (les réponses avant les parties, les parties avant les défis et les joueurs) : pas de CASCADE,
-- qui supprimerait sans le dire une clé étrangère posée depuis un autre schéma.
DROP TABLE IF EXISTS public."GameSessionAnswers";
DROP TABLE IF EXISTS public."GameSessions";
DROP TABLE IF EXISTS public."DailyChallengeTracks";
DROP TABLE IF EXISTS public."DailyChallenges";
DROP TABLE IF EXISTS public."Tracks";
DROP TABLE IF EXISTS public."EmailChangeTokens";
DROP TABLE IF EXISTS public."MagicLinkTokens";
DROP TABLE IF EXISTS public."Players";
DROP TABLE IF EXISTS public."DataProtectionKeys";
DROP TABLE IF EXISTS public."Settings";
DROP TABLE IF EXISTS public."__EFMigrationsHistory";

COMMIT;

SELECT count(*) AS objets_restants_dans_public
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S');

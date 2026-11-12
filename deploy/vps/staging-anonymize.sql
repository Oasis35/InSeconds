-- Anonymisation du staging (S8), après la copie des données de la prod.
-- Lancé par deploy/vps/copy-prod-db-to-staging.sh : psql -v ON_ERROR_STOP=1 -v keep=<STAGING_KEEP_EMAIL> < staging-anonymize.sql.
-- Aucune adresse, aucun pseudo ni aucun rôle admin de la prod ne reste, sauf ceux de l'adresse gardée. Jamais en prod.
BEGIN;

UPDATE players.accounts
   SET email = 'player-' || player_id || '@example.invalid',
       is_admin = false,
       -- 19 caractères (CHECK de 3 à 20), unique : tiré de l'identifiant du joueur, jamais du pseudo d'origine.
       pseudo = 'joueur-' || left(replace(player_id::text, '-', ''), 12)
 WHERE lower(email::text) <> lower(:'keep');
-- Le pseudo qu'un invité donne dans le mode Run est un texte libre : effacé (l'invité le redonnera).
UPDATE players.players SET guest_pseudo = NULL WHERE guest_pseudo IS NOT NULL;
-- Le nom d'un groupe d'amis est un texte libre choisi par un joueur : remplacé, et le code d'invitation (un secret de lien) renouvelé.
-- La table vient d'une migration de l'API : absente d'une copie d'une prod qui ne l'a pas encore.
DO $$
BEGIN
    IF to_regclass('social.groups') IS NOT NULL THEN
        UPDATE social.groups SET name = 'groupe-' || id, invite_code = upper(substr(md5(id::text || 'staging'), 1, 8)) WHERE id IS NOT NULL;
    END IF;
END $$;
-- TRUNCATE plutôt que DELETE sans WHERE : même effet ici (aucune table ne les référence), et l'intention « tout vider » est explicite.
TRUNCATE players.auth_tokens, players.device_sessions, players.legacy_tokens, infra.data_protection_keys;

-- File de messages de Wolverine : les messages à traiter, à envoyer, et ceux en erreur (« dead letters »), qui
-- gardent le corps du message (une adresse email pour un lien de connexion). Ces tables n'existent qu'une fois
-- l'API démarrée au moins une fois (Wolverine les crée, pas les migrations EF).
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['wolverine_incoming_envelopes', 'wolverine_outgoing_envelopes', 'wolverine_dead_letters'] LOOP
        IF to_regclass('messaging.' || t) IS NOT NULL THEN
            EXECUTE format('TRUNCATE messaging.%I', t);
        END IF;
    END LOOP;
END $$;

-- Les sauvegardes sont celles de la prod : le staging n'en fait pas, son admin ne doit pas en montrer.
-- La table vient d'une migration de l'API : absente d'une copie d'une prod qui ne l'a pas encore.
DO $$
BEGIN
    IF to_regclass('infra.backup_runs') IS NOT NULL THEN
        TRUNCATE infra.backup_runs;
    END IF;
END $$;

COMMIT;

SELECT count(*) AS comptes,
       count(*) FILTER (WHERE email::text NOT LIKE '%@example.invalid') AS emails_conserves,
       count(*) FILTER (WHERE pseudo::text NOT LIKE 'joueur-%') AS pseudos_conserves,
       count(*) FILTER (WHERE is_admin) AS admins
  FROM players.accounts;

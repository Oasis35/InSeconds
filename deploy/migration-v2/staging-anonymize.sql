-- Seconde anonymisation du staging (S8, § 10.1 étape 4 du plan v2), sur les tables v2, après l'import.
-- Lancé par import-to-staging.sh : psql -v ON_ERROR_STOP=1 -v keep=<STAGING_KEEP_EMAIL> -f staging-anonymize.sql.
-- La première anonymisation, faite sur public avant l'import, suffit en principe ; celle-ci garantit
-- qu'aucune donnée de prod ne reste, même si l'import évolue. Jamais en prod.
BEGIN;

UPDATE players.accounts
   SET email = 'player-' || player_id || '@example.invalid',
       is_admin = false
 WHERE lower(email::text) <> lower(:'keep');
DELETE FROM players.auth_tokens;
DELETE FROM players.device_sessions;
DELETE FROM players.legacy_tokens;
DELETE FROM infra.data_protection_keys;

-- File de messages de Wolverine : les messages à traiter, à envoyer, et ceux en erreur (« dead letters »), qui
-- gardent le corps du message (une adresse email pour un lien de connexion). Ces tables n'existent qu'une fois
-- l'API démarrée au moins une fois (Wolverine les crée, pas les migrations EF).
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['wolverine_incoming_envelopes', 'wolverine_outgoing_envelopes', 'wolverine_dead_letters'] LOOP
        IF to_regclass('messaging.' || t) IS NOT NULL THEN
            EXECUTE format('DELETE FROM messaging.%I', t);
        END IF;
    END LOOP;
END $$;

COMMIT;

SELECT count(*) AS comptes,
       count(*) FILTER (WHERE email::text NOT LIKE '%@example.invalid') AS emails_conserves,
       count(*) FILTER (WHERE is_admin) AS admins
  FROM players.accounts;

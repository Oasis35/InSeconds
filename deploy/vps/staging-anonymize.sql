-- Anonymisation du staging (S8, § 10.1 du plan de la refonte), après la copie des données de la prod.
-- Lancé par deploy/vps/copy-prod-db-to-staging.sh : psql -v ON_ERROR_STOP=1 -v keep=<STAGING_KEEP_EMAIL> < staging-anonymize.sql.
-- Aucune adresse, aucun pseudo ni aucun rôle admin de la prod ne reste, sauf ceux de l'adresse gardée. Jamais en prod.
BEGIN;

UPDATE players.accounts
   SET email = 'player-' || player_id || '@example.invalid',
       is_admin = false,
       -- 19 caractères (CHECK de 3 à 20), unique : tiré de l'identifiant du joueur, jamais du pseudo d'origine.
       pseudo = 'joueur-' || left(replace(player_id::text, '-', ''), 12)
 WHERE lower(email::text) <> lower(:'keep');
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

COMMIT;

SELECT count(*) AS comptes,
       count(*) FILTER (WHERE email::text NOT LIKE '%@example.invalid') AS emails_conserves,
       count(*) FILTER (WHERE pseudo::text NOT LIKE 'joueur-%') AS pseudos_conserves,
       count(*) FILTER (WHERE is_admin) AS admins
  FROM players.accounts;

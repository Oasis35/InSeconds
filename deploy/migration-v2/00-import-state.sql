-- État de l'import (§ 8.4 du plan v2), dans le schéma infra, créé par l'import lui-même (hors
-- migrations EF : seule l'API v2 de la bascule en a besoin).
--   imported_at : dernier import réussi (vérifications comprises) ;
--   opened_at   : ouverture de la v2 aux joueurs, posée par mark-opened.sql à la bascule.
CREATE TABLE IF NOT EXISTS infra.import_state (
    id          smallint PRIMARY KEY CHECK (id = 1),
    imported_at timestamptz NOT NULL,
    opened_at   timestamptz
);

-- Garde (PR G1, risque E2 du plan) : une fois la v2 ouverte, un nouvel import viderait les tables v2 et
-- effacerait les parties, séries et sessions d'appareils nées en v2. Refusé, sauf `run-import.sh --force`,
-- qui pose le réglage de session inseconds.import_force à « on » pour cette transaction seulement.
DO $$
DECLARE
    opened timestamptz;
BEGIN
    SELECT opened_at INTO opened FROM infra.import_state WHERE id = 1;
    IF opened IS NULL THEN
        RETURN;
    END IF;
    IF current_setting('inseconds.import_force', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'La v2 est ouverte aux joueurs depuis le % : un nouvel import effacerait ce qui a été joué en v2. Import refusé.', opened
            USING HINT = 'Seulement si c''est voulu (retour arrière décidé) : run-import.sh --force.';
    END IF;
    RAISE NOTICE 'Import forcé (--force) alors que la v2 est ouverte depuis le % : ce qui a été joué en v2 est remplacé par l''état de la v1.', opened;
END $$;

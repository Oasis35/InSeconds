-- Note l'ouverture de la v2 aux joueurs (§ 8.4 du plan v2, PR G1). À lancer à la bascule, juste avant de rouvrir
-- le site sur la v2 (procédure G2), une seule fois :
--   psql --no-psqlrc -v ON_ERROR_STOP=1 -f deploy/migration-v2/mark-opened.sql
-- Ensuite, run-import.sh refuse de tourner sans --force (00-import-state.sql) : il effacerait ce qui a été joué en v2.
-- Rejouable : la première date d'ouverture est gardée.
-- Deux IF : une seule expression qui nomme la table échouerait à la préparation si elle n'existe pas encore.
DO $$
DECLARE
    imported boolean := false;
BEGIN
    IF to_regclass('infra.import_state') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM infra.import_state WHERE id = 1)' INTO imported;
    END IF;
    IF NOT imported THEN
        RAISE EXCEPTION 'Aucun import réussi n''est noté (infra.import_state) : la v2 ne peut pas être déclarée ouverte.';
    END IF;
END $$;

UPDATE infra.import_state SET opened_at = COALESCE(opened_at, now()) WHERE id = 1;

SELECT imported_at AS dernier_import, opened_at AS ouverte_le FROM infra.import_state WHERE id = 1;

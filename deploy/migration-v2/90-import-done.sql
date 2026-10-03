-- Dernier pas de la transaction, après les vérifications : l'import est noté comme réussi.
INSERT INTO infra.import_state (id, imported_at)
VALUES (1, now())
ON CONFLICT (id) DO UPDATE SET imported_at = excluded.imported_at;

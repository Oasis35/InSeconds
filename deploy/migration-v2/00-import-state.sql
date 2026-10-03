-- État de l'import (§ 8.4 du plan v2), dans le schéma infra, créé par l'import lui-même (hors
-- migrations EF : seule l'API v2 de la bascule en a besoin).
--   imported_at : dernier import réussi (vérifications comprises) ;
--   opened_at   : ouverture de la v2 aux joueurs. Une fois posé, un nouvel import effacerait des
--                 parties jouées en v2 : la garde qui le refuse sans --force arrive avec l'import
--                 complet (PR G1).
CREATE TABLE IF NOT EXISTS infra.import_state (
    id          smallint PRIMARY KEY CHECK (id = 1),
    imported_at timestamptz NOT NULL,
    opened_at   timestamptz
);

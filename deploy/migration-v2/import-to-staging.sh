#!/usr/bin/env bash
# Import des données v1 dans les schémas v2 du staging, puis seconde anonymisation (S8).
# Lancé par le workflow manuel .github/workflows/staging-db-copy.yml (version env/staging), juste après
# deploy/vps/copy-prod-db-to-staging.sh (copie de public depuis la prod, première anonymisation).
# Envoyé par SSH (bash -s) ; les scripts SQL sont copiés à part dans IMPORT_DIR par le workflow,
# pour ne pas dépendre du checkout du staging.
set -euo pipefail

STAGING_DIR="${STAGING_DIR:-$HOME/apps/InSeconds-staging}"
IMPORT_DIR="${IMPORT_DIR:?à renseigner : dossier des scripts deploy/migration-v2}"
PG_IMAGE=postgres:17-alpine

read_env() { # read_env <fichier> <clé>
  grep -E "^$2=" "$1" | tail -n1 | cut -d= -f2-
}

staging_pw=$(read_env "$STAGING_DIR/.env.staging" INSECONDS_STAGING_DB_PASSWORD)
keep_email=$(read_env "$STAGING_DIR/.env.staging" STAGING_KEEP_EMAIL)
if [[ -z "$staging_pw" ]]; then
  echo "ERREUR : INSECONDS_STAGING_DB_PASSWORD manquant dans .env.staging." >&2
  exit 1
fi

pg() { # pg <commande…> : un conteneur postgres jetable, connecté à la base du staging
  docker run --rm -i --network shared-postgres \
    -e PGHOST=shared-postgres -e PGUSER=inseconds_staging -e PGDATABASE=inseconds_staging -e PGPASSWORD="$staging_pw" \
    -v "$IMPORT_DIR:/import:ro" "$PG_IMAGE" "$@"
}

# L'API staging est arrêtée pendant l'import : il vide ses tables (sessions d'appareils, clés).
staging_api_running=false
if [[ "$(docker inspect -f '{{.State.Running}}' inseconds-staging.api 2>/dev/null || true)" == "true" ]]; then
  staging_api_running=true
  docker stop inseconds-staging.api > /dev/null
fi
cleanup() {
  if [[ "$staging_api_running" == "true" ]]; then
    docker start inseconds-staging.api > /dev/null
  fi
  rm -rf "$IMPORT_DIR"
}
trap cleanup EXIT

echo "Import v1 → v2 (import et vérifications, une seule transaction)..."
pg sh /import/run-import.sh

# Seconde anonymisation, sur les tables v2 (S8) : la première, faite sur public avant l'import,
# suffit en principe ; celle-ci garantit qu'aucune donnée de prod ne reste, même si l'import évolue.
echo "Anonymisation des tables v2..."
pg psql --no-psqlrc -v ON_ERROR_STOP=1 -v keep="$keep_email" <<'SQL'
BEGIN;
UPDATE players.accounts
   SET email = 'player-' || player_id || '@example.invalid',
       is_admin = false
 WHERE lower(email::text) <> lower(:'keep');
DELETE FROM players.auth_tokens;
DELETE FROM players.device_sessions;
DELETE FROM infra.data_protection_keys;
COMMIT;
SELECT count(*) AS comptes,
       count(*) FILTER (WHERE email::text NOT LIKE '%@example.invalid') AS emails_conserves,
       count(*) FILTER (WHERE is_admin) AS admins
  FROM players.accounts;
SQL

echo "Import terminé."

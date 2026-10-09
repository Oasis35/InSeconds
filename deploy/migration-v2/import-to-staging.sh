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
  local file="$1" key="$2"
  grep -E "^$key=" "$file" | tail -n1 | cut -d= -f2-
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
pg sh /import/run-import.sh < /dev/null

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
DELETE FROM players.legacy_tokens;
DELETE FROM infra.data_protection_keys;
-- File de messages de Wolverine : ses tables n'existent qu'une fois l'API démarrée au moins une fois.
DO $$
BEGIN
    IF to_regclass('messaging.wolverine_incoming_envelopes') IS NOT NULL THEN
        DELETE FROM messaging.wolverine_incoming_envelopes;
    END IF;
    IF to_regclass('messaging.wolverine_outgoing_envelopes') IS NOT NULL THEN
        DELETE FROM messaging.wolverine_outgoing_envelopes;
    END IF;
END $$;
COMMIT;
SELECT count(*) AS comptes,
       count(*) FILTER (WHERE email::text NOT LIKE '%@example.invalid') AS emails_conserves,
       count(*) FILTER (WHERE is_admin) AS admins
  FROM players.accounts;
SQL

# Clé Data Protection neuve (S16). Sur le staging, la première anonymisation a déjà retiré les clés de la v1
# et la seconde vide encore la table : ce pas ne remplace donc pas une clé en clair, il répète la procédure de
# bascule (README) et vérifie la commande avec le vrai certificat. Lancé après la seconde anonymisation, qui
# vide les clés : avant, elle effacerait la clé neuve. L'image de l'API staging doit venir d'un déploiement
# de la PR B4 ou postérieur ; avec une image plus ancienne, le drapeau serait ignoré et l'API démarrerait,
# d'où le délai et la suppression du conteneur.
echo "Clé Data Protection neuve..."
cd "$STAGING_DIR"
rotate_container=inseconds-staging.rotate-key
if ! timeout 180 docker compose -f docker-compose.staging.yml --env-file .env.staging \
    run --rm -T --name "$rotate_container" api --rotate-data-protection-key < /dev/null; then
  docker rm -f "$rotate_container" > /dev/null 2>&1 || true
  echo "ERREUR : la clé Data Protection n'a pas pu être créée (image de l'API staging à jour ?)." >&2
  exit 1
fi

# Statistiques figées des jours terminés (E4) : l'import ne calcule rien, et la tâche daily-close-day attendrait minuit
# pour figer l'historique. Même mécanique que la clé ci-dessus : un conteneur jetable de l'image de l'API staging (qui
# lit les réglages en base), sans serveur ni tâche. Avec une image antérieure à E4, le drapeau serait ignoré et l'API
# démarrerait : d'où le délai et la suppression du conteneur.
echo "Statistiques figées de l'historique..."
freeze_container=inseconds-staging.freeze-stats
if ! timeout 600 docker compose -f docker-compose.staging.yml --env-file .env.staging \
    run --rm -T --name "$freeze_container" api --freeze-day-stats < /dev/null; then
  docker rm -f "$freeze_container" > /dev/null 2>&1 || true
  echo "ERREUR : les statistiques de l'historique n'ont pas été figées (jour en échec, ou image de l'API staging d'avant E4 ?)." >&2
  exit 1
fi

# Contrôle des photos (G1) : chaque jour terminé a la sienne, aux compteurs de la v1 (public), avec les paliers importés.
echo "Vérification des statistiques figées..."
pg psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 -f /import/30-verify-day-stats.sql < /dev/null

echo "Import terminé."

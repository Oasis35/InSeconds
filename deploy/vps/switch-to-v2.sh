#!/usr/bin/env bash
# Bascule v1 → v2 (refonte v2, PR G2). Lancé par le workflow manuel « Bascule v2 » (.github/workflows/bascule-v2.yml),
# sur le VPS, depuis le checkout positionné sur le commit à basculer :
#
#   ./deploy/vps/switch-to-v2.sh prod      # la vraie bascule (PLAN § 10.2)
#   ./deploy/vps/switch-to-v2.sh staging   # la répétition : mêmes étapes, sur la base du staging
#
# Déroulé (le site n'est indisponible qu'entre les étapes 2 et 5) :
#   1. préparation, sans arrêt de service : certificat Data Protection, image v2 construite, migrations v2
#      (--migrate-only, sans effet sur la v1), la v2 n'est pas déjà ouverte aux joueurs ;
#   2. arrêt de l'API v1 (le front v1 reste servi et affiche « Service indisponible ») ;
#   3. import des données, clé Data Protection neuve (S16), statistiques figées de l'historique et leur vérification ;
#   4. remplacement des conteneurs par la v2 (mêmes noms : Caddy ne change pas), santé et test de fumée (deploy.sh) ;
#   5. (prod) la v2 est déclarée ouverte aux joueurs (mark-opened.sql) et le déploiement automatique de main passe en v2.
#
# Au moindre écart avant l'étape 5, retour arrière (rollback) : la v2 est arrêtée, la v1 repart. Les tables v1 de `public`
# ne sont jamais modifiées par la v2, donc la v1 reprend exactement là où elle s'était arrêtée. Après l'étape 5, personne
# ne revient automatiquement en arrière : des parties ont pu être jouées en v2 (PLAN § 10.3).
#
# Staging : les deux piles s'appellent pareil (la v2 y est déjà déployée), le retour arrière redéploie donc le commit
# précédent (PREVIOUS_SHA) au lieu de redémarrer une v1. SIMULATE_FAILURE=after-import fait échouer la bascule juste après
# l'import, pour répéter le retour arrière (staging seulement).
set -euo pipefail

target="${1:-}"
case "$target" in
  prod)
    stack_dir=$HOME/apps/InSeconds
    env_file=.env.prod
    new_compose=docker-compose.prod-v2.yml
    old_compose=docker-compose.prod.yml
    container_prefix=inseconds
    db_user=inseconds
    db_name=inseconds
    db_password_key=INSECONDS_DB_PASSWORD
    api_url=https://api.inseconds.cc
    ;;
  staging)
    stack_dir=$HOME/apps/InSeconds-staging
    env_file=.env.staging
    new_compose=docker-compose.staging.yml
    old_compose=
    container_prefix=inseconds-staging
    db_user=inseconds_staging
    db_name=inseconds_staging
    db_password_key=INSECONDS_STAGING_DB_PASSWORD
    api_url=https://api-dev.inseconds.cc
    ;;
  *)
    echo "Usage : $0 prod|staging" >&2
    exit 2
    ;;
esac

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
if [[ "$(pwd)" != "$stack_dir" ]]; then
  echo "ERREUR : lancé depuis $(pwd), la pile $target se trouve dans $stack_dir." >&2
  exit 1
fi
if [[ "${SIMULATE_FAILURE:-}" != "" && "$target" != "staging" ]]; then
  echo "ERREUR : SIMULATE_FAILURE n'est permis que sur le staging." >&2
  exit 1
fi

PG_IMAGE=postgres:17-alpine
api_container=$container_prefix.api
front_container=$container_prefix.front

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
new_stack() { docker compose -f "$new_compose" --env-file "$env_file" "$@"; }
old_stack() { docker compose -f "$old_compose" --env-file "$env_file" "$@"; }

read_env() { # read_env <clé>
  local key="$1"
  grep -E "^$key=" "$env_file" | tail -n1 | cut -d= -f2-
}

db_password=$(read_env "$db_password_key")
if [[ -z "$db_password" ]]; then
  echo "ERREUR : $db_password_key manquant dans $env_file." >&2
  exit 1
fi

pg() { # pg <commande…> : un conteneur postgres jetable, connecté à la base de la pile
  docker run --rm -i --network shared-postgres \
    -e PGHOST=shared-postgres -e PGUSER="$db_user" -e PGDATABASE="$db_name" -e PGPASSWORD="$db_password" \
    -v "$PWD/deploy/migration-v2:/import:ro" "$PG_IMAGE" "$@"
}

# --- Retour arrière ---------------------------------------------------------------------------------------------------

committed=false
old_api_stopped=false

rollback() {
  log "ERREUR : la bascule a échoué, retour arrière."
  # La v2 s'arrête d'abord : ses noms de conteneurs sont ceux de la v1.
  new_stack rm -sf api front || true
  if [[ "$target" == "prod" ]]; then
    # La v1 repart de ses images (--no-build) ; à défaut, elle est reconstruite.
    old_stack up -d --no-build api front || old_stack up -d --build api front
  else
    if [[ -z "${PREVIOUS_SHA:-}" ]]; then
      echo "PREVIOUS_SHA absent : relancer le déploiement du staging à la main (ci.yml, push sur env/staging)." >&2
      return 1
    fi
    git checkout --force --detach "$PREVIOUS_SHA"
    ./deploy/vps/deploy.sh staging
  fi
  log "Retour arrière terminé : l'ancienne version est revenue. Les tables v1 n'ont pas été touchées."
}

on_exit() {
  local rc=$?
  trap - EXIT
  if [[ $rc -ne 0 && "$committed" != "true" && "$old_api_stopped" == "true" ]]; then
    rollback || echo "ERREUR : le retour arrière a lui-même échoué, intervention manuelle nécessaire." >&2
  fi
  exit "$rc"
}
trap on_exit EXIT

# --- 1. Préparation, sans arrêt de service ------------------------------------------------------------------------------

log "1/5 Préparation ($target)"
cert=secrets/dataprotection.pfx
if [[ ! -f "$cert" ]]; then
  echo "ERREUR : $cert absent du checkout (cf. $env_file.example)." >&2
  exit 1
fi
if [[ -z "$(read_env DATA_PROTECTION_CERTIFICATE_PASSWORD)" ]]; then
  echo "ERREUR : DATA_PROTECTION_CERTIFICATE_PASSWORD manquant dans $env_file (mot de passe de $cert)." >&2
  exit 1
fi

# La v2 est déclarée ouverte aux joueurs ? Un nouvel import effacerait ce qui y a été joué : on s'arrête avant tout arrêt.
# La table est créée par le premier import : tant qu'elle n'existe pas, rien n'est ouvert (et la requête ne peut pas la
# nommer, elle échouerait à la préparation).
opened_at=""
if [[ "$(pg psql --no-psqlrc -tA -v ON_ERROR_STOP=1 -c "SELECT to_regclass('infra.import_state') IS NOT NULL" < /dev/null)" == "t" ]]; then
  opened_at=$(pg psql --no-psqlrc -tA -v ON_ERROR_STOP=1 -c "SELECT coalesce(opened_at::text, '') FROM infra.import_state WHERE id = 1" < /dev/null)
fi
if [[ -n "${opened_at//[[:space:]]/}" ]]; then
  echo "ERREUR : la v2 est déjà ouverte aux joueurs depuis le $opened_at. La bascule ne rejoue pas l'import (PLAN § 10.3) :" >&2
  echo "        un retour arrière se décide à la main (deploy/migration-v2/README.md, --force)." >&2
  exit 1
fi

export BUILD_TIME
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
new_stack build
if ! new_stack run --rm -T --no-deps --entrypoint sh api -c "test -f /run/secrets/dataprotection.pfx && test -r /run/secrets/dataprotection.pfx"; then
  echo "ERREUR : $cert illisible par l'utilisateur de l'image de l'API (uid/gid 1654), cf. $env_file.example." >&2
  exit 1
fi
log "Migrations v2 (sans effet sur la v1)..."
new_stack run --rm -T api --migrate-only < /dev/null

# --- 2. Arrêt de l'API v1 -----------------------------------------------------------------------------------------------

log "2/5 Arrêt de l'API actuelle ($api_container)"
if [[ "$(docker inspect -f '{{.State.Running}}' "$api_container" 2>/dev/null || true)" == "true" ]]; then
  docker stop "$api_container" > /dev/null
fi
# Rien à restaurer tant que l'API n'a pas été touchée : le retour arrière ne sert qu'à partir d'ici.
old_api_stopped=true

# --- 3. Données ---------------------------------------------------------------------------------------------------------

log "3/5 Import des données"
if [[ "$target" == "staging" ]]; then
  # Mêmes étapes que la prod, plus l'anonymisation de la copie de prod : import-to-staging.sh les enchaîne (import,
  # seconde anonymisation, clé neuve, statistiques figées et leur vérification). Il supprime son dossier à la fin.
  import_dir=$(mktemp -d)
  cp -r deploy/migration-v2/. "$import_dir"
  IMPORT_DIR="$import_dir" STAGING_DIR="$PWD" bash deploy/migration-v2/import-to-staging.sh
else
  # Import et vérifications, une seule transaction : au moindre écart rien n'est gardé.
  pg sh /import/run-import.sh < /dev/null
  # Clé Data Protection neuve avant le démarrage de l'API (S16), puis historique figé avec les réglages importés.
  log "Clé Data Protection neuve..."
  timeout 180 docker compose -f "$new_compose" --env-file "$env_file" run --rm -T --name "$container_prefix.rotate-key" api --rotate-data-protection-key < /dev/null \
    || { docker rm -f "$container_prefix.rotate-key" > /dev/null 2>&1 || true; echo "ERREUR : clé Data Protection non créée." >&2; exit 1; }
  log "Statistiques figées de l'historique..."
  timeout 600 docker compose -f "$new_compose" --env-file "$env_file" run --rm -T --name "$container_prefix.freeze-stats" api --freeze-day-stats < /dev/null \
    || { docker rm -f "$container_prefix.freeze-stats" > /dev/null 2>&1 || true; echo "ERREUR : statistiques de l'historique non figées." >&2; exit 1; }
  pg psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 -f /import/30-verify-day-stats.sql < /dev/null
fi

if [[ "${SIMULATE_FAILURE:-}" == "after-import" ]]; then
  echo "ERREUR simulée (SIMULATE_FAILURE=after-import) : répétition du retour arrière." >&2
  exit 1
fi

# --- 4. Démarrage de la v2 ----------------------------------------------------------------------------------------------

log "4/5 Démarrage de la v2"
if [[ "$target" == "prod" ]]; then
  # Mêmes noms de conteneurs que la v2 : ceux de la v1 sont retirés (leurs images restent, pour le retour arrière).
  old_stack rm -sf api front
fi
# deploy.sh : image, certificat, migrations, démarrage, santé de l'API et du front, test de fumée (dont les routes de la
# v1 en 410). INSECONDS_V2=1 : en prod, le marqueur de bascule n'est posé qu'à l'étape suivante.
INSECONDS_V2=1 ./deploy/vps/deploy.sh "$target"

# --- 5. Ouverture -------------------------------------------------------------------------------------------------------

if [[ "$target" == "prod" ]]; then
  log "5/5 La v2 est ouverte aux joueurs"
  pg psql --no-psqlrc -v ON_ERROR_STOP=1 -f /import/mark-opened.sql < /dev/null
  # À partir d'ici, plus de retour arrière automatique ; le déploiement de main passe en v2.
  committed=true
  touch .bascule-v2-done
else
  log "5/5 (staging : la v2 n'est jamais déclarée ouverte, les copies prod → staging restent rejouables)"
  committed=true
fi

log "Bascule $target terminée : $api_url répond en v2."

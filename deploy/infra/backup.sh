#!/usr/bin/env bash
# Sauvegarde de la base de prod InSeconds (`inseconds`, tous schémas), à lancer sur le VPS.
# Mode d'emploi complet : deploy/infra/README.md § Sauvegardes.
#
#   ./backup.sh                       sauvegarde : dump, vérification, rotation locale,
#                                     envoi chiffré vers R2 et ping healthchecks.io si configurés
#   ./backup.sh list-remote           liste les sauvegardes présentes sur R2
#   ./backup.sh fetch <nom>           télécharge et déchiffre une sauvegarde de R2 dans BACKUP_DIR
#                                     (ex. : ./backup.sh fetch monthly/inseconds-2026-10-01T030000Z.dump)
#   ./backup.sh restore-test [dump]   restaure un dump (le plus récent par défaut) dans une base
#                                     jetable, affiche ce qu'elle contient, puis la supprime
#
# Réglages : deploy/infra/.env (non commité, cf. .env.example). Seul INSECONDS_DB_PASSWORD est
# obligatoire ; sans les clés R2, la sauvegarde reste sur le VPS ; sans HEALTHCHECK_URL, aucun ping.
# Lancé chaque nuit par le workflow .github/workflows/db-backup.yml (SSH + `bash -s`), ou à la main.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" && pwd) # « . » si lancé par `bash -s`
ENV_FILE="${BACKUP_ENV_FILE:-$SCRIPT_DIR/.env}"
PG_IMAGE=postgres:17-alpine # même version majeure que shared-postgres
RCLONE_IMAGE=rclone/rclone:1.75.2
DB_NAME=inseconds
DB_USER=inseconds
DB_HOST=shared-postgres
NETWORK=shared-postgres
RESTORE_TEST_DB=inseconds_restore_test

read_env() { # read_env <clé> [défaut] : valeur de deploy/infra/.env, sans `source` (pas d'exécution)
  local value=""
  if [[ -f "$ENV_FILE" ]]; then
    value=$(grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2-) || true
  fi
  printf '%s' "${value:-${2:-}}"
}

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
fail() { echo "ERREUR : $*" >&2; exit 1; }

BACKUP_DIR=$(read_env BACKUP_DIR "$HOME/backups/postgres")
LOCAL_KEEP_DAYS=$(read_env BACKUP_LOCAL_KEEP_DAYS 7)
REMOTE_DAILY_KEEP_DAYS=$(read_env BACKUP_REMOTE_DAILY_KEEP_DAYS 30)
REMOTE_MONTHLY_KEEP_DAYS=$(read_env BACKUP_REMOTE_MONTHLY_KEEP_DAYS 365)
HEALTHCHECK_URL=$(read_env HEALTHCHECK_URL)
R2_BUCKET=$(read_env R2_BUCKET inseconds-backups)

# Les secrets passent aux conteneurs par variable d'environnement (`-e NOM`, sans valeur sur la
# ligne de commande) : ils n'apparaissent ni dans `ps` ni dans l'historique du shell.
export PGPASSWORD
PGPASSWORD=$(read_env INSECONDS_DB_PASSWORD)

# Outil Postgres dans un conteneur jetable sur le réseau de la base. `pg_in` lit l'entrée standard
# (pg_restore < dump) ; `pg` ne la lit pas : lancé par `ssh … bash -s` (workflow db-backup.yml),
# le script arrive justement par l'entrée standard, qu'un `docker run -i` consommerait.
pg() { docker run --rm --network "$NETWORK" -e PGPASSWORD "$PG_IMAGE" "$@" < /dev/null; }
pg_in() { docker run --rm -i --network "$NETWORK" -e PGPASSWORD "$PG_IMAGE" "$@"; }

# ---------- R2 (stockage S3 de Cloudflare) via rclone, contenu chiffré par rclone crypt ----------

r2_configured() {
  local keys=(R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT BACKUP_ENCRYPTION_PASSWORD)
  local set=0 key
  for key in "${keys[@]}"; do
    if [[ -n "$(read_env "$key")" ]]; then set=$((set + 1)); fi
  done
  if (( set == 0 )); then return 1; fi
  (( set == ${#keys[@]} )) || fail "R2 à moitié configuré : renseigner ${keys[*]} dans $ENV_FILE (ou aucun)."
}

rclone_env_ready=false
prepare_rclone_env() {
  if "$rclone_env_ready"; then return; fi
  # Remote `r2` : le bucket. Remote `r2crypt` : chiffrement du contenu par-dessus (noms de fichiers
  # en clair pour pouvoir lister par date). Le jeton R2 n'a que les droits objet : pas de création
  # de bucket (no_check_bucket).
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    RCLONE_CONFIG_R2CRYPT_TYPE=crypt RCLONE_CONFIG_R2CRYPT_REMOTE="r2:$R2_BUCKET" \
    RCLONE_CONFIG_R2CRYPT_FILENAME_ENCRYPTION=off RCLONE_CONFIG_R2CRYPT_DIRECTORY_NAME_ENCRYPTION=false
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY RCLONE_CONFIG_R2_ENDPOINT
  RCLONE_CONFIG_R2_ACCESS_KEY_ID=$(read_env R2_ACCESS_KEY_ID)
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$(read_env R2_SECRET_ACCESS_KEY)
  RCLONE_CONFIG_R2_ENDPOINT=$(read_env R2_ENDPOINT)
  # rclone attend la phrase de passe sous forme « obscurcie » (`rclone obscure`, lue sur stdin).
  export RCLONE_CONFIG_R2CRYPT_PASSWORD
  RCLONE_CONFIG_R2CRYPT_PASSWORD=$(read_env BACKUP_ENCRYPTION_PASSWORD | docker run --rm -i "$RCLONE_IMAGE" --config "" obscure -)
  rclone_env_ready=true
}

rclone_mount_mode=ro # fetch seul monte le dossier des dumps en écriture
rclone_run() { # rclone_run <args...> : le dossier des dumps est monté sur /backups
  prepare_rclone_env
  # --user : les fichiers téléchargés (fetch) appartiennent à l'utilisateur du VPS, pas à root,
  # sinon la rotation locale ne pourrait plus les supprimer.
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$BACKUP_DIR:/backups:$rclone_mount_mode" \
    -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY -e RCLONE_CONFIG_R2_ENDPOINT \
    -e RCLONE_CONFIG_R2CRYPT_TYPE -e RCLONE_CONFIG_R2CRYPT_REMOTE -e RCLONE_CONFIG_R2CRYPT_PASSWORD \
    -e RCLONE_CONFIG_R2CRYPT_FILENAME_ENCRYPTION -e RCLONE_CONFIG_R2CRYPT_DIRECTORY_NAME_ENCRYPTION \
    "$RCLONE_IMAGE" --config "" "$@" # --config "" : tout vient de l'environnement, aucun fichier
}

upload_to_r2() { # upload_to_r2 <nom du dump>
  local name="$1" month
  log "Envoi chiffré vers R2 (daily/$name)..."
  rclone_run copyto "/backups/$name" "r2crypt:daily/$name"
  # Une sauvegarde mensuelle : la première du mois est aussi copiée dans monthly/.
  month=${name#inseconds-}
  month=${month:0:7}
  # (lsf échoue tant que monthly/ n'existe pas sur un stockage local ; sur R2, liste vide.)
  if [[ -z "$(rclone_run lsf r2crypt:monthly/ --include "inseconds-$month-*" 2> /dev/null || true)" ]]; then
    log "Première sauvegarde du mois : copie dans monthly/."
    rclone_run copyto "/backups/$name" "r2crypt:monthly/$name"
  fi
  log "Rotation R2 : daily/ > $REMOTE_DAILY_KEEP_DAYS j, monthly/ > $REMOTE_MONTHLY_KEEP_DAYS j supprimés."
  rclone_run delete r2crypt:daily/ --min-age "${REMOTE_DAILY_KEEP_DAYS}d"
  rclone_run delete r2crypt:monthly/ --min-age "${REMOTE_MONTHLY_KEEP_DAYS}d"
}

# ---------- healthchecks.io : /start au début, succès ou /fail à la fin ----------

hc_ping() { # hc_ping [suffixe] : jamais bloquant, un ping raté ne fait pas échouer la sauvegarde
  [[ -n "$HEALTHCHECK_URL" ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL${1:-}" || log "Ping healthchecks.io impossible."
}

# ---------- vérification d'un dump ----------

verify_dump() { # verify_dump <fichier> : lisible par pg_restore et contient des données
  local file="$1" entries
  [[ -s "$file" ]] || fail "dump vide : $file"
  entries=$(pg_in pg_restore --list < "$file" | grep -c ' TABLE DATA ' || true)
  (( entries > 0 )) || fail "dump illisible ou sans données : $file"
  log "Dump vérifié : $entries tables avec données, $(du -h "$file" | cut -f1)."
}

# ---------- commandes ----------

backup() {
  [[ -n "$PGPASSWORD" ]] || fail "INSECONDS_DB_PASSWORD manquant dans $ENV_FILE."
  local use_r2=false
  if r2_configured; then use_r2=true; fi

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  exec 9> "$BACKUP_DIR/.lock"
  flock -n 9 || fail "une sauvegarde est déjà en cours."

  local name
  name="inseconds-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
  # Globale : le trap EXIT s'exécute hors de la fonction, quand ses variables locales n'existent plus.
  tmp_dump="$BACKUP_DIR/.$name.part"
  # Ping /fail à toute sortie en erreur (le ping de succès est envoyé explicitement à la fin).
  trap 'status=$?; rm -f "$tmp_dump"; if (( status != 0 )); then hc_ping /fail; fi' EXIT
  hc_ping /start

  log "Dump de la base $DB_NAME (tous schémas)..."
  ( umask 077; pg pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -Fc > "$tmp_dump" )
  verify_dump "$tmp_dump"
  mv "$tmp_dump" "$BACKUP_DIR/$name"
  log "Sauvegarde locale : $BACKUP_DIR/$name"

  log "Rotation locale : dumps de plus de $LOCAL_KEEP_DAYS j supprimés."
  find "$BACKUP_DIR" -maxdepth 1 -name 'inseconds-*.dump' ! -name "$name" \
    -mmin +$((LOCAL_KEEP_DAYS * 1440)) -print -delete

  if "$use_r2"; then
    upload_to_r2 "$name"
  else
    log "R2 non configuré : la sauvegarde reste sur le VPS (cf. README § Sauvegardes)."
  fi

  hc_ping
  log "Sauvegarde terminée."
}

restore_test() { # restore_test [fichier] : restauration complète dans une base jetable
  local file="${1:-}"
  if [[ -z "$file" ]]; then
    file=$(find "$BACKUP_DIR" -maxdepth 1 -name 'inseconds-*.dump' | sort | tail -n1)
    [[ -n "$file" ]] || fail "aucun dump dans $BACKUP_DIR."
  fi
  [[ -f "$file" ]] || fail "fichier introuvable : $file"
  # La base jetable se crée avec le compte postgres : l'utilisateur inseconds n'a pas CREATEDB.
  PGPASSWORD=$(read_env POSTGRES_SUPERUSER_PASSWORD)
  [[ -n "$PGPASSWORD" ]] || fail "POSTGRES_SUPERUSER_PASSWORD manquant dans $ENV_FILE."

  trap 'pg dropdb -h "$DB_HOST" -U postgres --if-exists "$RESTORE_TEST_DB" || true' EXIT
  log "Restauration de $(basename "$file") dans la base jetable $RESTORE_TEST_DB..."
  pg dropdb -h "$DB_HOST" -U postgres --if-exists "$RESTORE_TEST_DB"
  pg createdb -h "$DB_HOST" -U postgres "$RESTORE_TEST_DB"
  pg_in pg_restore -h "$DB_HOST" -U postgres -d "$RESTORE_TEST_DB" --no-owner --no-privileges \
    --exit-on-error < "$file"
  log "Restauration réussie. Lignes par table (estimation après ANALYZE) :"
  pg psql -h "$DB_HOST" -U postgres -d "$RESTORE_TEST_DB" -v ON_ERROR_STOP=1 -q -c 'ANALYZE;' -c "
    SELECT schemaname AS schema, relname AS \"table\", n_live_tup AS lignes
    FROM pg_stat_user_tables ORDER BY schemaname, relname;"
  log "Base jetable supprimée. La base de prod n'a pas été touchée."
}

list_remote() {
  r2_configured || fail "R2 non configuré dans $ENV_FILE."
  log "daily/ :"; rclone_run lsl r2crypt:daily/
  log "monthly/ :"; rclone_run lsl r2crypt:monthly/
}

fetch() { # fetch <daily/… ou monthly/…> : copie déchiffrée dans BACKUP_DIR
  local path="${1:-}"
  [[ "$path" =~ ^(daily|monthly)/inseconds-[0-9TZ-]+\.dump$ ]] \
    || fail "attendu : daily/<nom>.dump ou monthly/<nom>.dump (cf. ./backup.sh list-remote)."
  r2_configured || fail "R2 non configuré dans $ENV_FILE."
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  rclone_mount_mode=rw
  rclone_run copyto "r2crypt:$path" "/backups/$(basename "$path")"
  verify_dump "$BACKUP_DIR/$(basename "$path")"
  log "Téléchargé : $BACKUP_DIR/$(basename "$path") (à tester avec ./backup.sh restore-test <fichier>)."
}

case "${1:-backup}" in
  backup) backup ;;
  list-remote) list_remote ;;
  fetch) fetch "${2:-}" ;;
  restore-test) restore_test "${2:-}" ;;
  *) fail "commande inconnue : $1 (attendu : backup, list-remote, fetch ou restore-test)" ;;
esac

#!/usr/bin/env bash
# Sauvegarde de la base de prod InSeconds (`inseconds`, tous schémas), à lancer sur le VPS.
# Mode d'emploi complet : deploy/infra/README.md § Sauvegardes. Le contrôle de restauration est backup-verify.sh.
#
#   ./backup.sh                       sauvegarde : dump, vérification, rotation locale,
#                                     envoi chiffré vers R2 et signal à healthchecks.io si configurés
#   ./backup.sh archive               sauvegarde gardée sans limite de durée : dump, vérification, envoi
#                                     chiffré dans archive/ sur R2 (R2 obligatoire), jamais supprimée
#                                     par la rotation (ex. : avant une suppression de données)
#   ./backup.sh list-remote           liste les sauvegardes présentes sur R2
#   ./backup.sh fetch <nom>           télécharge et déchiffre une sauvegarde de R2 dans BACKUP_DIR
#                                     (ex. : ./backup.sh fetch monthly/inseconds-2026-10-01T030000Z.dump)
#   ./backup.sh restore-test [dump]   restaure un dump (le plus récent par défaut) dans un Postgres
#                                     jetable, affiche ce qu'il contient, puis le supprime
#
# Réglages : deploy/infra/.env (non commité, cf. .env.example). Seul INSECONDS_DB_PASSWORD est
# obligatoire ; sans les clés R2, la sauvegarde reste sur le VPS. Le signal vers healthchecks.io et les logs
# vers Grafana reprennent la configuration de l'API (../../.env.prod) ; sans elle, rien n'est envoyé.
# Chaque sauvegarde (réussie ou non) est notée dans infra.backup_runs, que l'admin affiche.
# Lancé chaque nuit par le timer systemd deploy/infra/systemd/inseconds-backup.timer, ou à la main.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backup-common.sh
source "$SCRIPT_DIR/backup-common.sh"

LOCAL_KEEP_DAYS=$(read_env BACKUP_LOCAL_KEEP_DAYS 7)
REMOTE_DAILY_KEEP_DAYS=$(read_env BACKUP_REMOTE_DAILY_KEEP_DAYS 30)
REMOTE_MONTHLY_KEEP_DAYS=$(read_env BACKUP_REMOTE_MONTHLY_KEEP_DAYS 365)

upload_to_r2() { # upload_to_r2 <nom du dump>
  local name="$1" month
  log "Envoi chiffré vers R2 (daily/$name)..."
  rclone_in rcat -q "r2crypt:daily/$name" < "$BACKUP_DIR/$name"
  # Une sauvegarde mensuelle : la première du mois est aussi copiée dans monthly/.
  month=${name#inseconds-}
  month=${month:0:7}
  # (lsf échoue tant que monthly/ n'existe pas sur un stockage local ; sur R2, liste vide.)
  if [[ -z "$(rclone_run lsf r2crypt:monthly/ --include "inseconds-$month-*" 2> /dev/null || true)" ]]; then
    log "Première sauvegarde du mois : copie dans monthly/."
    rclone_in rcat -q "r2crypt:monthly/$name" < "$BACKUP_DIR/$name"
  fi
  log "Rotation R2 : daily/ > $REMOTE_DAILY_KEEP_DAYS j, monthly/ > $REMOTE_MONTHLY_KEEP_DAYS j supprimés."
  rclone_run delete r2crypt:daily/ --min-age "${REMOTE_DAILY_KEEP_DAYS}d"
  rclone_run delete r2crypt:monthly/ --min-age "${REMOTE_MONTHLY_KEEP_DAYS}d"
}

prepare_backup_dir() { # dossier local et verrou partagés par backup et archive
  [[ -n "$PGPASSWORD" ]] || fail "INSECONDS_DB_PASSWORD manquant dans $ENV_FILE."
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  exec 9> "$BACKUP_DIR/.lock"
  flock -n 9 || fail "une sauvegarde est déjà en cours."
}

dump_database() { # dump_database <nom> : dump vérifié dans BACKUP_DIR, écrit d'abord dans $tmp_dump
  local name="$1"
  log "Dump de la base $DB_NAME (tous schémas)..."
  ( umask 077; pg pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -Fc > "$tmp_dump" )
  verify_dump "$tmp_dump"
  mv "$tmp_dump" "$BACKUP_DIR/$name"
  REPORT_DUMP="$name"
  REPORT_SIZE=$(stat -c %s "$BACKUP_DIR/$name")
  REPORT_TAKEN=$(dump_time "$name")
  log "Sauvegarde locale : $BACKUP_DIR/$name"
}

# Les deux commandes qui sauvegardent : nom du dump, fichier provisoire et compte rendu final (trap EXIT : ligne en base,
# healthchecks.io pour la nuit seulement, Grafana). Globales : le trap s'exécute hors de la fonction.
start_backup_run() { # start_backup_run <kind> <contrôle healthchecks.io ou vide>
  require_prod
  start_journal
  name="inseconds-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
  tmp_dump="$BACKUP_DIR/.$name.part"
  run_kind="$1"
  run_check="$2"
  trap 'status=$?; rm -f "$tmp_dump"; report_run "$status" "$run_kind" "$run_check"' EXIT
}

backup() {
  start_backup_run backup inseconds-backup
  local use_r2=false
  step 1/3 dump "dump"
  if r2_configured; then use_r2=true; fi
  REPORT_OFF_SITE="$use_r2"
  prepare_backup_dir
  dump_database "$name"

  step 2/3 rotation "rotation locale"
  log "Rotation locale : dumps de plus de $LOCAL_KEEP_DAYS j supprimés."
  find "$BACKUP_DIR" -maxdepth 1 -name 'inseconds-*.dump' ! -name "$name" \
    -mmin +$((LOCAL_KEEP_DAYS * 1440)) -print -delete

  step 3/3 upload "envoi vers R2"
  if "$use_r2"; then
    upload_to_r2 "$name"
  else
    log "R2 non configuré : la sauvegarde reste sur le VPS (cf. README § Sauvegardes)."
  fi

  REPORT_SUMMARY="Sauvegarde OK : $name, $(du -h "$BACKUP_DIR/$name" | cut -f1), copie sur R2 : $use_r2."
  log "Sauvegarde terminée."
}

archive() { # sauvegarde gardée sans limite de durée sur R2 (archive/), hors de toute rotation
  start_backup_run archive ""
  step 1/2 dump "dump"
  r2_configured || fail "R2 non configuré dans $ENV_FILE : une archive doit quitter le VPS."
  REPORT_OFF_SITE=true
  prepare_backup_dir
  dump_database "$name"

  step 2/2 upload "envoi vers R2"
  log "Envoi chiffré vers R2 (archive/$name)..."
  rclone_in rcat -q "r2crypt:archive/$name" < "$BACKUP_DIR/$name"
  [[ -n "$(rclone_run lsf r2crypt:archive/ --include "$name")" ]] || fail "archive/$name absente de R2 après l'envoi."
  REPORT_DUMP="archive/$name"
  REPORT_SUMMARY="Archive OK : archive/$name."
  log "Archive terminée : archive/$name (jamais supprimée par la rotation)."
}

restore_test() { # restore_test [fichier] : restauration complète dans un Postgres jetable, à la main
  local file="${1:-}"
  if [[ -z "$file" ]]; then
    file=$(find "$BACKUP_DIR" -maxdepth 1 -name 'inseconds-*.dump' | sort | tail -n1)
    [[ -n "$file" ]] || fail "aucun dump dans $BACKUP_DIR."
  fi
  [[ -f "$file" ]] || fail "fichier introuvable : $file"

  trap scratch_stop EXIT
  scratch_start
  log "Restauration de $(basename "$file")..."
  scratch_restore "$file"
  log "Restauration réussie. Lignes par table (estimation après ANALYZE) :"
  docker exec "$SCRATCH" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -q -c 'ANALYZE;' -c "
    SELECT schemaname AS schema, relname AS \"table\", n_live_tup AS lignes
    FROM pg_stat_user_tables ORDER BY schemaname, relname;" < /dev/null
  log "Postgres jetable supprimé. La base de prod n'a pas été touchée."
}

list_remote() {
  r2_configured || fail "R2 non configuré dans $ENV_FILE."
  log "daily/ :"; rclone_run lsl r2crypt:daily/
  log "monthly/ :"; rclone_run lsl r2crypt:monthly/
  # (lsl échoue tant qu'archive/ n'existe pas sur un stockage local ; sur R2, liste vide.)
  log "archive/ :"; rclone_run lsl r2crypt:archive/ 2> /dev/null || true
}

fetch() { # fetch <daily/…, monthly/… ou archive/…> : copie déchiffrée dans BACKUP_DIR
  local path="${1:-}"
  [[ "$path" =~ ^(daily|monthly|archive)/inseconds-[0-9TZ-]+\.dump$ ]] \
    || fail "attendu : daily/<nom>.dump, monthly/<nom>.dump ou archive/<nom>.dump (cf. ./backup.sh list-remote)."
  r2_configured || fail "R2 non configuré dans $ENV_FILE."
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  local file
  file="$BACKUP_DIR/$(basename "$path")"
  ( umask 077; rclone_run cat "r2crypt:$path" > "$file.part" ) || { rm -f "$file.part"; fail "téléchargement impossible : $path"; }
  mv "$file.part" "$file"
  verify_dump "$file"
  log "Téléchargé : $file (à tester avec ./backup.sh restore-test <fichier>)."
}

case "${1:-backup}" in
  backup) backup ;;
  archive) archive ;;
  list-remote) list_remote ;;
  fetch) fetch "${2:-}" ;;
  restore-test) restore_test "${2:-}" ;;
  *) fail "commande inconnue : $1 (attendu : backup, archive, list-remote, fetch ou restore-test)" ;;
esac

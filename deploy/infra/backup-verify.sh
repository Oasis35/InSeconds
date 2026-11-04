#!/usr/bin/env bash
# Contrôle de restauration de la sauvegarde de la nuit, à lancer sur le VPS (prod seulement).
# Mode d'emploi complet : deploy/infra/README.md § Contrôle de restauration.
#
#   ./backup-verify.sh    1. fraîcheur : la dernière sauvegarde de daily/ sur R2 a moins de 26 h, le mois a sa copie dans monthly/
#                         2. téléchargement : elle est récupérée de R2 et déchiffrée (copie distante et phrase de passe valides)
#                         3. restauration : complète, dans un Postgres jetable à part (jamais shared-postgres), supprimé ensuite
#                         4. contenu : défi du jour (ou de la veille), dernière migration connue de la prod, nombre de lignes
#                            des tables principales au moins égal à 95 % de la prod
#                         5. compte rendu : ligne dans infra.backup_runs (kind = verify), signal healthchecks.io
#                            « inseconds-backup-restore » (fin du journal jointe en cas d'échec), logs vers Grafana
#
# Réglages : ceux de backup.sh (deploy/infra/.env, cf. .env.example), R2 obligatoire. Seuils facultatifs :
# BACKUP_VERIFY_MAX_AGE_HOURS (26) et BACKUP_VERIFY_MIN_ROW_PERCENT (95).
# Lancé chaque nuit à 4 h UTC par le timer systemd deploy/infra/systemd/inseconds-backup-verify.timer, ou à la main.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backup-common.sh
source "$SCRIPT_DIR/backup-common.sh"

MAX_AGE_HOURS=$(read_env BACKUP_VERIFY_MAX_AGE_HOURS 26)
MIN_ROW_PERCENT=$(read_env BACKUP_VERIFY_MIN_ROW_PERCENT 95)
# Tables comparées à la prod : celles qui ne font que grossir (une purge nocturne vide les autres, ex. appareils, jetons).
CHECKED_TABLES=(players.players players.accounts catalogue.tracks daily.challenges daily.challenge_tracks daily.sessions
  daily.answers daily.streaks runs.challenges runs.sessions)

check_freshness() { # pose $latest (daily/<nom>) : la sauvegarde la plus récente de R2
  local names month now taken age_hours
  # Une liste illisible (clés R2, réseau) n'est pas une liste vide : l'erreur de rclone reste dans le journal.
  names=$(rclone_run lsf r2crypt:daily/ --include 'inseconds-*.dump') || fail "liste de daily/ illisible sur R2."
  latest=$(printf '%s\n' "$names" | grep -E '^inseconds-' | sort | tail -n1) || true
  [[ -n "$latest" ]] || fail "aucune sauvegarde dans daily/ sur R2."
  taken=$(dump_time "$latest") || fail "nom de sauvegarde inattendu : daily/$latest."
  REPORT_DUMP="daily/$latest"
  REPORT_TAKEN="$taken"
  now=$(date -u +%s)
  age_hours=$(( (now - $(date -u -d "$taken" +%s)) / 3600 ))
  (( age_hours < MAX_AGE_HOURS )) \
    || fail "dernière sauvegarde daily/$latest vieille de $age_hours h (au plus $MAX_AGE_HOURS h)."
  log "Dernière sauvegarde : daily/$latest ($age_hours h)."
  month=$(date -u +%Y-%m)
  names=$(rclone_run lsf r2crypt:monthly/ --include "inseconds-$month-*") || fail "liste de monthly/ illisible sur R2."
  [[ -n "$names" ]] || fail "aucune copie du mois $month dans monthly/."
  log "Copie mensuelle de $month présente."
  latest="daily/$latest"
}

download() { # download <daily/…> : copie déchiffrée dans $work, pose $file
  local path="$1"
  file="$work/$(basename "$path")"
  ( umask 077; rclone_run cat "r2crypt:$path" > "$file" ) || fail "téléchargement ou déchiffrement impossible : $path."
  REPORT_SIZE=$(stat -c %s "$file")
  verify_dump "$file"
}

check_content() { # compare la base restaurée à la prod (lectures seules dans la prod)
  local taken_day last_day last_migration known table restored prod percent rows
  taken_day=${REPORT_TAKEN:0:10}
  last_day=$(scratch_query "SELECT coalesce(max(date)::text, '') FROM daily.challenges")
  [[ -n "$last_day" ]] || fail "daily.challenges est vide dans la sauvegarde."
  # Défi du jour de la sauvegarde (généré à minuit), ou de la veille si la génération a pris du retard.
  [[ "$last_day" > "$(date -u -d "$taken_day -2 days" +%F)" ]] \
    || fail "daily.challenges sans le défi du $taken_day ni de la veille (dernier : $last_day)."
  log "Dernier défi dans la sauvegarde : $last_day."

  last_migration=$(scratch_query "SELECT coalesce(max(migration_id), '') FROM infra.__ef_migrations_history")
  [[ -n "$last_migration" ]] || fail "aucune migration dans la sauvegarde."
  # La valeur vient du dump : variable psql (:'nom'), jamais collée dans le SQL.
  known=$(pg_in psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -Atq -v migration="$last_migration" \
    <<< "SELECT count(*) FROM infra.__ef_migrations_history WHERE migration_id = :'migration'")
  [[ "$known" == 1 ]] || fail "dernière migration de la sauvegarde ($last_migration) inconnue de la prod."
  log "Dernière migration de la sauvegarde : $last_migration (connue de la prod)."

  # Deux requêtes de chaque côté (tables présentes, puis leurs lignes), pas une par table : chacune lance un conteneur.
  # Chaque résultat passe par une variable : l'échec d'une requête lue par `< <(…)` échapperait à set -e (boucle vide, faux succès).
  local list existing=() missing union
  list=$(printf "'%s'," "${CHECKED_TABLES[@]}")
  rows=$(prod_query "SELECT t FROM unnest(ARRAY[${list%,}]) t WHERE to_regclass(t) IS NOT NULL ORDER BY t")
  [[ -n "$rows" ]] || fail "aucune des tables contrôlées n'existe en prod."
  mapfile -t existing <<< "$rows"
  list=$(printf "'%s'," "${existing[@]}")
  missing=$(scratch_query "SELECT string_agg(t, ', ') FROM unnest(ARRAY[${list%,}]) t WHERE to_regclass(t) IS NULL")
  [[ -z "$missing" ]] || fail "tables absentes de la sauvegarde : $missing."
  union=""
  for table in "${existing[@]}"; do union+="SELECT '$table', count(*) FROM $table UNION ALL "; done
  union=${union% UNION ALL }
  declare -A prod_counts=()
  rows=$(prod_query "$union")
  while IFS='|' read -r table prod; do prod_counts[$table]=$prod; done <<< "$rows"
  rows=$(scratch_query "$union")
  local checked=0
  while IFS='|' read -r table restored; do
    prod=${prod_counts[$table]:-}
    [[ -n "$prod" && -n "$restored" ]] || fail "comptage inattendu pour « $table »."
    checked=$((checked + 1))
    if (( prod == 0 )); then percent=100; else percent=$(( restored * 100 / prod )); fi
    log "$table : $restored lignes dans la sauvegarde, $prod en prod ($percent %)."
    (( percent >= MIN_ROW_PERCENT )) \
      || fail "$table : $restored lignes dans la sauvegarde contre $prod en prod ($percent %, au moins $MIN_ROW_PERCENT %)."
  done <<< "$rows"
  (( checked == ${#existing[@]} )) || fail "$checked tables comptées sur ${#existing[@]}."
}

verify() {
  require_prod
  start_journal
  work=""
  trap 'status=$?; scratch_stop; if [[ -n "$work" ]]; then rm -rf "$work"; fi; report_run "$status" verify inseconds-backup-restore' EXIT
  local started latest file
  started=$(date -u +%s)
  [[ -n "$PGPASSWORD" ]] || fail "INSECONDS_DB_PASSWORD manquant dans $ENV_FILE."
  r2_configured || fail "R2 non configuré dans $ENV_FILE : rien à contrôler."
  REPORT_OFF_SITE=true

  step 1/5 freshness "fraîcheur"
  check_freshness

  step 2/5 download "téléchargement"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  work=$(mktemp -d "$BACKUP_DIR/.verify-XXXXXX")
  download "$latest"

  step 3/5 restore "restauration"
  scratch_start
  scratch_restore "$file"
  log "Restauration complète réussie."

  step 4/5 content "contenu"
  check_content

  step 5/5 report "compte rendu"
  REPORT_SUMMARY="Restauration OK : $latest ($(du -h "$file" | cut -f1)) restaurée et contrôlée en $(( $(date -u +%s) - started )) s."
  log "$REPORT_SUMMARY"
}

case "${1:-verify}" in
  verify) verify ;;
  *) fail "commande inconnue : $1 (sans argument : contrôle de la dernière sauvegarde)" ;;
esac

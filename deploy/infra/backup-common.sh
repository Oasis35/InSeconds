# Code commun de backup.sh (la sauvegarde) et de backup-verify.sh (le contrôle de restauration), chargé par `source`.
# Mode d'emploi : deploy/infra/README.md § Sauvegardes. Ne se lance pas seul.
#
# Réglages : deploy/infra/.env (non commité, cf. .env.example). Les clés healthchecks.io et OTLP (Grafana) sont reprises de
# l'API (../../.env.prod) si deploy/infra/.env ne les donne pas.

# shellcheck shell=bash
SCRIPT_DIR=${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}
ENV_FILE="${BACKUP_ENV_FILE:-$SCRIPT_DIR/.env}"
PG_IMAGE=postgres:17-alpine # même version majeure que shared-postgres
RCLONE_IMAGE=rclone/rclone:1.75.2
DB_NAME=inseconds # jamais une autre base : la prod seulement (cf. require_prod)
DB_USER=inseconds

read_env_file() { # read_env_file <fichier> <clé> : valeur, sans `source` (pas d'exécution)
  local file="$1" key="$2" value=""
  if [[ -f "$file" ]]; then
    value=$(grep -E "^$key=" "$file" | tail -n1 | cut -d= -f2-) || true
  fi
  value=${value%\"}; value=${value#\"} # guillemets facultatifs d'un fichier .env docker compose
  printf '%s' "$value"
}

read_env() { # read_env <clé> [défaut] : valeur de deploy/infra/.env
  local value
  value=$(read_env_file "$ENV_FILE" "$1")
  printf '%s' "${value:-${2:-}}"
}

# Clés partagées avec l'API : deploy/infra/.env d'abord, sinon .env.prod.
API_ENV_FILE="${BACKUP_API_ENV_FILE:-$SCRIPT_DIR/../../.env.prod}"
read_api_env() {
  local key="$1" value
  value=$(read_env "$key")
  printf '%s' "${value:-$(read_env_file "$API_ENV_FILE" "$key")}"
}

# Base et réseau Docker de shared-postgres (surchargés seulement par les tests).
DB_HOST=$(read_env BACKUP_DB_HOST shared-postgres)
NETWORK=$(read_env BACKUP_DOCKER_NETWORK shared-postgres)
# shellcheck disable=SC2034 # lu par backup.sh et backup-verify.sh
BACKUP_DIR=$(read_env BACKUP_DIR "$HOME/backups/postgres")
R2_BUCKET=$(read_env R2_BUCKET inseconds-backups)
HEALTHCHECKS_PING_KEY=$(read_api_env HEALTHCHECKS_PING_KEY)
HEALTHCHECKS_URL=$(read_api_env HEALTHCHECKS_URL)
HEALTHCHECKS_URL=${HEALTHCHECKS_URL:-https://hc-ping.com}
OTLP_ENDPOINT=$(read_api_env OTEL_EXPORTER_OTLP_ENDPOINT)
BACKUP_RUNS_KEEP_DAYS=$(read_env BACKUP_RUNS_KEEP_DAYS 90)

# Les secrets passent aux conteneurs par variable d'environnement (`-e NOM`, sans valeur sur la
# ligne de commande) : ils n'apparaissent ni dans `ps` ni dans l'historique du shell.
export PGPASSWORD
PGPASSWORD=$(read_env INSECONDS_DB_PASSWORD)

# ---------- journal du passage ----------

STEP="" # étape en cours (nom court, colonne failed_step), posée par `step`
STEP_LABEL=""
RUN_LOG=""
RUN_STARTED_AT=""

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
fail() { echo "ERREUR : $*" >&2; exit 1; }

step() { # step <n/total> <nom> <libellé> : début d'une étape, rappelée dans le message d'un échec
  local position="$1" name="$2" label="$3"
  STEP="$name"
  STEP_LABEL="étape $position $label"
  log "--- $STEP_LABEL"
}

# Toute la sortie du passage (la nôtre, celle de pg_restore, de rclone…) va aussi dans un fichier : il part vers
# healthchecks.io et Grafana en cas d'échec. La sortie standard reste celle de systemd (journalctl).
start_journal() {
  RUN_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  RUN_LOG=$(mktemp)
  exec 3>&1 4>&2
  exec > >(tee -a "$RUN_LOG") 2>&1
  JOURNAL_PID=$!
  # Arrêt demandé (systemctl stop, délai de l'unité dépassé, Ctrl+C) : bash ne lance pas le trap EXIT sur un signal sans
  # trap à lui. On sort donc proprement, pour que le compte rendu parte et que le Postgres jetable soit supprimé.
  trap 'echo "ERREUR : passage interrompu (signal reçu)." >&2; exit 143' TERM INT
}

stop_journal() { # rend la sortie d'origine et attend que tee ait tout écrit
  exec 1>&3 2>&4
  wait "$JOURNAL_PID" 2> /dev/null || true
}

failure_message() { # message court d'un échec : la ligne ERREUR, sinon la dernière ligne du journal
  local status="$1" line
  line=$(grep -E '^ERREUR : ' "$RUN_LOG" | tail -n1 | sed 's/^ERREUR : //') || true
  if [[ -z "$line" ]]; then
    line="échec inattendu (code $status) : $(grep -v '^\[' "$RUN_LOG" | grep -v '^[[:space:]]*$' | tail -n1 || true)"
  fi
  printf '%s : %s' "${STEP_LABEL:-avant la première étape}" "$line" | utf8_cut 500
}

utf8_cut() { # utf8_cut <octets> : coupe l'entrée sans laisser de caractère UTF-8 coupé en deux (refusé par Postgres)
  local bytes="$1"
  head -c "$bytes" | iconv -f UTF-8 -t UTF-8 -c 2> /dev/null || true
}

# ---------- garde-fou : la prod seulement ----------

# Le staging n'est jamais sauvegardé ni contrôlé (il se recopie depuis la prod) : un script lancé depuis son checkout
# (~/apps/InSeconds-staging, avec .env.staging) s'arrête avant de rien faire, sans signal ni journal envoyés.
require_prod() {
  local root
  root=$(cd "$SCRIPT_DIR/../.." && pwd)
  if [[ "$(basename "$root")" == *-staging || -f "$root/.env.staging" ]]; then
    echo "ERREUR : $root est le checkout du staging : sauvegardes et contrôles ne tournent que sur la prod." >&2
    exit 1
  fi
}

# ---------- Postgres ----------

# Outil Postgres dans un conteneur jetable sur le réseau de la base. `pg_in` lit l'entrée standard
# (pg_restore < dump) ; `pg` ne la lit pas, pour qu'un `docker run -i` ne consomme jamais l'entrée
# standard du script (fatal si le script lui-même arrive par là, ex. `ssh … bash -s`).
pg() { docker run --rm --network "$NETWORK" -e PGPASSWORD "$PG_IMAGE" "$@" < /dev/null; }
pg_in() { docker run --rm -i --network "$NETWORK" -e PGPASSWORD "$PG_IMAGE" "$@"; }

prod_query() { # prod_query <sql> : une valeur lue dans la base de prod (lecture seule)
  local sql="$1"
  pg psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -Atqc "$sql"
}

verify_dump() { # verify_dump <fichier> : lisible par pg_restore et contient des données
  local file="$1" entries
  [[ -s "$file" ]] || fail "dump vide : $file"
  entries=$(pg_in pg_restore --list < "$file" | grep -c ' TABLE DATA ' || true)
  (( entries > 0 )) || fail "dump illisible ou sans données : $file"
  log "Dump vérifié : $entries tables avec données, $(du -h "$file" | cut -f1)."
}

# Postgres jetable pour restaurer un dump : conteneur à part, sans réseau (--network none) ni port, mémoire bornée, supprimé à la
# fin. Il ne touche jamais shared-postgres, et n'a besoin d'aucun mot de passe (accès local par `docker exec`).
SCRATCH=""
scratch_start() {
  scratch_cleanup_stale
  SCRATCH="inseconds-backup-scratch-$$"
  log "Postgres jetable $SCRATCH ($PG_IMAGE, sans réseau)..."
  docker run -d --rm --name "$SCRATCH" --network none --memory 1g -e POSTGRES_HOST_AUTH_METHOD=trust "$PG_IMAGE" > /dev/null
  # Prêt quand il répond en TCP local : pendant son initialisation, le serveur provisoire n'écoute que sur le socket.
  local i
  for i in $(seq 1 60); do
    if docker exec "$SCRATCH" pg_isready -q -h 127.0.0.1 -U postgres < /dev/null; then break; fi
    (( i < 60 )) || fail "le Postgres jetable n'a pas démarré en 60 s."
    sleep 1
  done
  docker exec "$SCRATCH" createdb -U postgres "$DB_NAME" < /dev/null
}
scratch_restore() { # scratch_restore <fichier> : restauration complète, arrêt à la première erreur
  local file="$1"
  docker exec -i "$SCRATCH" pg_restore -U postgres -d "$DB_NAME" --no-owner --no-privileges --exit-on-error < "$file" \
    2> >(pg_errors_only >&2)
}
# Erreurs de pg_restore sans le contenu des tables : le journal part vers healthchecks.io, Grafana et l'admin, alors qu'un
# COPY qui échoue cite la ligne fautive (lignes DETAIL, CONTEXT, Command was : email, pseudo…). Restent les lignes
# « pg_restore: … », coupées après « ERROR: <raison>: » (la suite peut citer une valeur) et à 300 caractères.
pg_errors_only() {
  local line
  while IFS= read -r line; do
    [[ "$line" == "pg_restore: "* ]] || continue
    printf '%s' "$line" | sed -E 's/(ERROR: +[^:]*:).*/\1 …/' | utf8_cut 300
    echo
  done
}
scratch_cleanup_stale() { # conteneurs jetables et copies déchiffrées laissés par un passage tué (SIGKILL : pas de trap)
  local name pid
  for name in $(docker ps -a --filter name=inseconds-backup-scratch- --format '{{.Names}}'); do
    pid=${name##*-}
    if [[ "$pid" =~ ^[0-9]+$ ]] && ! kill -0 "$pid" 2> /dev/null; then
      log "Postgres jetable d'un passage interrompu supprimé : $name."
      docker rm -f "$name" > /dev/null 2>&1 || true
    fi
  done
  if [[ -d "$BACKUP_DIR" ]]; then
    find "$BACKUP_DIR" -maxdepth 1 -name '.verify-*' -type d -mmin +90 -print -exec rm -rf {} + || true
  fi
}
scratch_query() { # scratch_query <sql> : une valeur lue dans la base restaurée
  local sql="$1"
  docker exec "$SCRATCH" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -Atqc "$sql" < /dev/null
}
scratch_stop() {
  if [[ -n "$SCRATCH" ]]; then docker rm -f "$SCRATCH" > /dev/null 2>&1 || true; fi
}

# Une ligne par passage dans infra.backup_runs (table de l'API, lue par le panneau technique de l'admin), puis purge des
# lignes trop vieilles. Jamais bloquant : seul l'affichage de l'admin en pâtirait. Les valeurs passent en variables psql
# (:'nom'), jamais collées dans le SQL : un message d'erreur peut contenir n'importe quel caractère.
record_run() { # record_run <kind> <ok|failed> [étape] [message] [dump] [taille] [heure du dump] [true|false|vide]
  local kind="$1" outcome="$2" failed_step="${3:-}" message="${4:-}" dump="${5:-}" size="${6:-}" taken="${7:-}" off_site="${8:-}"
  pg_in psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q \
    -v kind="$kind" -v outcome="$outcome" -v started="$RUN_STARTED_AT" -v step="$failed_step" -v message="$message" \
    -v dump="$dump" -v size="$size" -v taken="$taken" -v off_site="$off_site" -v keep="$BACKUP_RUNS_KEEP_DAYS" << 'SQL' \
    || log "Passage non noté en base (infra.backup_runs)."
INSERT INTO infra.backup_runs (kind, outcome, started_at, finished_at, failed_step, message, dump_name, dump_size_bytes, dump_taken_at, off_site)
VALUES (:'kind', :'outcome', NULLIF(:'started', '')::timestamptz, now(), NULLIF(:'step', ''), NULLIF(:'message', ''),
        NULLIF(:'dump', ''), NULLIF(:'size', '')::bigint, NULLIF(:'taken', '')::timestamptz, NULLIF(:'off_site', '')::boolean);
DELETE FROM infra.backup_runs WHERE finished_at < now() - make_interval(days => :'keep'::int);
SQL
}

# ---------- R2 (stockage S3 de Cloudflare) via rclone, contenu chiffré par rclone crypt ----------

r2_configured() {
  local keys=(R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT BACKUP_ENCRYPTION_PASSWORD)
  local set=0 key
  for key in "${keys[@]}"; do
    if [[ -n "$(read_env "$key")" ]]; then set=$((set + 1)); fi
  done
  if (( set == 0 )); then return 1; fi
  (( set == ${#keys[@]} )) || fail "R2 à moitié configuré : renseigner ${keys[*]} dans $ENV_FILE (ou aucun)."
  # Ici, dans le shell du script : les appels suivants, souvent dans un $(…), retrouvent la configuration toute prête.
  prepare_rclone_env
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

# Les dumps passent par l'entrée / la sortie standard (rcat, cat), jamais par un dossier monté :
# un montage dépend des droits et du mappage d'utilisateurs de Docker sur l'hôte (sur le VPS,
# rclone ne voyait pas le fichier monté).
rclone_run() { # rclone_run <args...> : sans entrée standard
  rclone_in "$@" < /dev/null
}
rclone_in() { # rclone_in <args...> : lit l'entrée standard (rcat)
  prepare_rclone_env
  docker run --rm -i \
    -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY -e RCLONE_CONFIG_R2_ENDPOINT \
    -e RCLONE_CONFIG_R2CRYPT_TYPE -e RCLONE_CONFIG_R2CRYPT_REMOTE -e RCLONE_CONFIG_R2CRYPT_PASSWORD \
    -e RCLONE_CONFIG_R2CRYPT_FILENAME_ENCRYPTION -e RCLONE_CONFIG_R2CRYPT_DIRECTORY_NAME_ENCRYPTION \
    "$RCLONE_IMAGE" --config "" "$@" # --config "" : tout vient de l'environnement, aucun fichier
}

dump_time() { # dump_time <nom> : heure d'un dump, lue dans son nom (inseconds-2026-11-04T030001Z.dump → 2026-11-04T03:00:01Z)
  local name="$1" stamp
  stamp=$(basename "$name" .dump)
  stamp=${stamp#inseconds-}
  [[ "$stamp" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$ ]] || return 1
  printf '%sT%s:%s:%sZ' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" "${BASH_REMATCH[4]}"
}

# ---------- healthchecks.io ----------

# Contrôles créés au premier signal (?create=1) : healthchecks.io prévient (email) dès un /fail, ou si aucun signal
# n'arrive à l'heure prévue (VPS éteint, timer arrêté). Un /fail emporte la fin du journal du passage, affichée dans
# l'email et sur la page du contrôle. Jamais bloquant.
hc_signal() { # hc_signal <contrôle> <ok|fail> [fichier joint]
  local check="$1" outcome="$2" body="${3:-/dev/null}" suffix=""
  [[ -n "$HEALTHCHECKS_PING_KEY" ]] || return 0
  if [[ "$outcome" == fail ]]; then suffix="/fail"; fi
  # L'adresse contient la clé : passée à curl par un fichier de config sur l'entrée standard, absente de `ps`.
  printf 'url = "%s/%s/%s%s?create=1"\n' "${HEALTHCHECKS_URL%/}" "$HEALTHCHECKS_PING_KEY" "$check" "$suffix" \
    | curl -fsS -m 10 --retry 3 -o /dev/null -X POST --data-binary @"$body" -K - \
    || log "Signal healthchecks.io impossible."
}

# ---------- Grafana (logs OTLP) ----------

json_string() { # json_string <texte> : chaîne JSON, guillemets compris (caractères de contrôle retirés)
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/ }
  s=$(printf '%s' "$s" | tr -d '\000-\037')
  printf '"%s"' "$s"
}

otlp_record() { # otlp_record <INFO|ERROR> <texte> <kind> <outcome> <étape> : un logRecord OTLP en JSON
  local severity="$1" text="$2" kind="$3" outcome="$4" step="$5" number=9
  if [[ "$severity" == ERROR ]]; then number=17; fi
  printf '{"timeUnixNano":"%s","severityNumber":%s,"severityText":"%s","body":{"stringValue":%s},"attributes":[%s,%s,%s]}' \
    "$(date -u +%s%N)" "$number" "$severity" "$(json_string "$text")" \
    "{\"key\":\"backup.kind\",\"value\":{\"stringValue\":$(json_string "$kind")}}" \
    "{\"key\":\"backup.outcome\",\"value\":{\"stringValue\":$(json_string "$outcome")}}" \
    "{\"key\":\"backup.step\",\"value\":{\"stringValue\":$(json_string "$step")}}"
}

# Logs du service « inseconds-backup » dans Grafana (Loki), avec la configuration OTLP de l'API : en échec, tout le journal du
# passage, une ligne par ligne du journal ; en réussite, la seule ligne de résumé. Aucune alerte Grafana : l'alerte, c'est
# healthchecks.io. Jamais bloquant.
otlp_send() { # otlp_send <kind> <ok|failed> <résumé>
  [[ -n "$OTLP_ENDPOINT" ]] || return 0
  local kind="$1" outcome="$2" summary="$3" records="" line severity headers pair key value config="" body
  if [[ "$outcome" == failed ]]; then
    while IFS= read -r line; do
      [[ -n "${line// /}" ]] || continue
      severity=INFO
      if [[ "$line" == ERREUR* ]]; then severity=ERROR; fi
      records+="${records:+,}$(otlp_record "$severity" "$line" "$kind" "$outcome" "$STEP")"
    done < <(tail -n 300 "$RUN_LOG")
    records+="${records:+,}$(otlp_record ERROR "$summary" "$kind" "$outcome" "$STEP")"
  else
    records=$(otlp_record INFO "$summary" "$kind" "$outcome" "")
  fi
  # En-têtes : OTEL_EXPORTER_OTLP_HEADERS = « clé=valeur,… », valeurs encodées en URL (%20…).
  # Passés à curl par un fichier de config sur l'entrée standard : absents de `ps`.
  headers=$(read_api_env OTEL_EXPORTER_OTLP_HEADERS)
  IFS=',' read -ra pairs <<< "$headers"
  for pair in "${pairs[@]}"; do
    [[ "$pair" == *=* ]] || continue
    key=${pair%%=*}
    value=$(printf '%s' "${pair#*=}" | sed 's/%\([0-9A-Fa-f][0-9A-Fa-f]\)/\\x\1/g')
    value=$(printf '%b' "$value") # %20 → espace, etc.
    value=${value//\\/\\\\}
    config+="header = \"$key: ${value//\"/\\\"}\""$'\n'
  done
  body=$(mktemp)
  printf '{"resourceLogs":[{"resource":{"attributes":[%s,%s]},"scopeLogs":[{"scope":{"name":"%s"},"logRecords":[%s]}]}]}' \
    '{"key":"service.name","value":{"stringValue":"inseconds-backup"}}' \
    '{"key":"deployment.environment.name","value":{"stringValue":"Production"}}' \
    "$kind" "$records" > "$body"
  printf '%s' "$config" | curl -fsS -m 15 --retry 3 -o /dev/null -K - \
    -H 'Content-Type: application/json' --data-binary @"$body" "${OTLP_ENDPOINT%/}/v1/logs" \
    || log "Envoi du journal à Grafana impossible."
  rm -f "$body"
}

# Compte rendu d'un passage, à la fin (trap EXIT) : ligne en base, signal healthchecks.io (si contrôle donné), Grafana.
# Le passage pose REPORT_SUMMARY (résumé d'une réussite) et REPORT_DUMP, REPORT_SIZE, REPORT_TAKEN, REPORT_OFF_SITE dès qu'il les connaît.
report_run() { # report_run <status> <kind> <contrôle healthchecks.io ou vide>
  local status="$1" kind="$2" check="$3" summary="${REPORT_SUMMARY:-Passage $2 réussi.}" message tail_file
  stop_journal
  if (( status == 0 )); then
    record_run "$kind" ok "" "" "${REPORT_DUMP:-}" "${REPORT_SIZE:-}" "${REPORT_TAKEN:-}" "${REPORT_OFF_SITE:-}"
    [[ -z "$check" ]] || hc_signal "$check" ok
    otlp_send "$kind" ok "$summary"
  else
    message=$(failure_message "$status")
    echo "ÉCHEC du passage, $message" >&2
    record_run "$kind" failed "$STEP" "$message" "${REPORT_DUMP:-}" "${REPORT_SIZE:-}" "${REPORT_TAKEN:-}" "${REPORT_OFF_SITE:-}"
    if [[ -n "$check" ]]; then
      tail_file=$(mktemp)
      { echo "$message"; echo; tail -c 8000 "$RUN_LOG"; } > "$tail_file"
      hc_signal "$check" fail "$tail_file"
      rm -f "$tail_file"
    fi
    otlp_send "$kind" failed "Passage $kind en échec, $message"
  fi
  rm -f "$RUN_LOG"
}

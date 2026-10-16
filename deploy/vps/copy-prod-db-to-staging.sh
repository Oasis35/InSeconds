#!/usr/bin/env bash
# Copie les données de la prod (base inseconds) dans la base du staging (inseconds_staging), puis les anonymise.
# Lancé par le workflow manuel .github/workflows/staging-db-copy.yml : script envoyé par SSH sur le VPS via
# `bash -s`, donc indépendant du contenu du checkout staging, avec STAGING_ANONYMIZE_SQL qui pointe sur le
# staging-anonymize.sql du même commit. Ne touche jamais la base de prod autrement qu'en lecture (pg_dump).
#
# Depuis la mise en prod de la v2 (16/10/2026, PR I1 #235) : la prod écrit dans les schémas des modules, la copie les prend
# directement (players, catalogue, daily, infra). Avant, elle copiait les tables v1 de public et refaisait l'import.
# Ni public (tables v1, supprimées en I1), ni messaging (file de Wolverine), ni jobs (Hangfire) : le staging garde
# les siens. Ni infra.data_protection_keys : les clés de la prod ne quittent jamais la prod.
#
# Étapes, API staging arrêtée du début à la fin :
#   1. pg_dump des schémas des modules de la prod ;
#   2. suppression des schémas des modules du staging (infra : ses tables sauf data_protection_keys), puis restauration ;
#   3. migrations du staging (--migrate-only, image de l'API staging) : la copie a la structure de la prod,
#      env/staging peut avoir des migrations d'avance ;
#   4. anonymisation (staging-anonymize.sql, testé par MigrationTests) : emails remplacés par
#      player-<id>@example.invalid et rôle admin retiré, sauf STAGING_KEEP_EMAIL (.env.staging) ; jetons,
#      appareils, jetons v1, clés Data Protection et file de Wolverine vidés ;
#   5. clé Data Protection neuve (--rotate-data-protection-key).
# Les réglages (infra.settings) et les statistiques figées viennent de la prod, tels quels.
set -euo pipefail

PROD_DIR="${PROD_DIR:-$HOME/apps/InSeconds}"
STAGING_DIR="${STAGING_DIR:-$HOME/apps/InSeconds-staging}"
ANONYMIZE_SQL=$(realpath "${STAGING_ANONYMIZE_SQL:?à renseigner : chemin de staging-anonymize.sql}")
PG_IMAGE=postgres:17-alpine
SCHEMAS=(players catalogue daily infra)

read_env() { # read_env <fichier> <clé>
  local file="$1" key="$2"
  grep -E "^$key=" "$file" | tail -n1 | cut -d= -f2-
}

prod_pw=$(read_env "$PROD_DIR/.env.prod" INSECONDS_DB_PASSWORD)
staging_pw=$(read_env "$STAGING_DIR/.env.staging" INSECONDS_STAGING_DB_PASSWORD)
keep_email=$(read_env "$STAGING_DIR/.env.staging" STAGING_KEEP_EMAIL)

if [[ -z "$prod_pw" || -z "$staging_pw" ]]; then
  echo "ERREUR : INSECONDS_DB_PASSWORD (.env.prod) ou INSECONDS_STAGING_DB_PASSWORD (.env.staging) manquant." >&2
  exit 1
fi
if [[ ! -f "$ANONYMIZE_SQL" ]]; then
  echo "ERREUR : $ANONYMIZE_SQL introuvable." >&2
  exit 1
fi
if [[ -z "$keep_email" ]]; then
  echo "::warning::STAGING_KEEP_EMAIL vide dans .env.staging : aucun compte ne gardera son email, connexion admin impossible en staging."
fi

# Les mots de passe passent aux conteneurs par l'environnement (`-e PGPASSWORD`, sans valeur) : absents de `ps`.
pg_prod() { PGPASSWORD="$prod_pw" docker run --rm -i --network shared-postgres -e PGPASSWORD "$PG_IMAGE" "$@"; }
pg_staging() {
  PGPASSWORD="$staging_pw" docker run --rm -i --network shared-postgres -e PGPASSWORD \
    -e PGHOST=shared-postgres -e PGUSER=inseconds_staging -e PGDATABASE=inseconds_staging "$PG_IMAGE" "$@"
}

dump=$(mktemp)
restore_list=$(mktemp)

# L'API staging est arrêtée pendant toute la copie : les schémas qu'elle utilise disparaissent un moment, et ses
# tâches de fond pourraient écrire entre la restauration et l'anonymisation.
staging_api_running=false
if [[ "$(docker inspect -f '{{.State.Running}}' inseconds-staging.api 2>/dev/null || true)" == "true" ]]; then
  staging_api_running=true
  docker stop inseconds-staging.api > /dev/null
fi
cleanup() {
  if [[ "$staging_api_running" == "true" ]]; then
    docker start inseconds-staging.api > /dev/null
  fi
  rm -f "$dump" "$restore_list"
}
trap cleanup EXIT

echo "Dump des schémas des modules de la prod (${SCHEMAS[*]}, sans les clés Data Protection)..."
schema_args=()
for schema in "${SCHEMAS[@]}"; do schema_args+=(-n "$schema"); done
pg_prod pg_dump -h shared-postgres -U inseconds -d inseconds "${schema_args[@]}" \
  -T infra.data_protection_keys -Fc --no-owner --no-privileges < /dev/null > "$dump"

# Le schéma infra reste au staging (il y garde data_protection_keys) : sa création est retirée de la liste restaurée.
pg_prod pg_restore -l < "$dump" | grep -v -E ' SCHEMA - infra( |$)| COMMENT - SCHEMA infra( |$)' > "$restore_list"

echo "Suppression des schémas des modules du staging..."
pg_staging psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DROP SCHEMA IF EXISTS daily, catalogue, players CASCADE;
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'infra' AND tablename <> 'data_protection_keys' LOOP
        EXECUTE format('DROP TABLE infra.%I CASCADE', t);
    END LOOP;
END $$;
COMMIT;
SQL

echo "Restauration dans inseconds_staging..."
# --exit-on-error : un échec partiel laisserait une base à moitié copiée, pas encore anonymisée. Le relancer
# repart de zéro (les schémas sont supprimés à chaque passage).
PGPASSWORD="$staging_pw" docker run --rm -i --network shared-postgres -e PGPASSWORD \
  -v "$restore_list:/tmp/restore.list:ro" "$PG_IMAGE" \
  pg_restore -h shared-postgres -U inseconds_staging -d inseconds_staging \
  --no-owner --no-privileges --exit-on-error -L /tmp/restore.list < "$dump"

# Image de l'API staging telle que déployée (aucun build), réglages de son checkout.
cd "$STAGING_DIR"
echo "Migrations du staging..."
docker compose -f docker-compose.staging.yml --env-file .env.staging run --rm -T api --migrate-only < /dev/null

echo "Anonymisation..."
pg_staging psql --no-psqlrc -v ON_ERROR_STOP=1 -v keep="$keep_email" < "$ANONYMIZE_SQL"

# Après l'anonymisation, qui vide les clés : avant, elle effacerait la clé neuve. Le délai et la suppression du
# conteneur couvrent une image qui ignorerait le drapeau et démarrerait l'API.
echo "Clé Data Protection neuve..."
rotate_container=inseconds-staging.rotate-key
if ! timeout 180 docker compose -f docker-compose.staging.yml --env-file .env.staging \
    run --rm -T --name "$rotate_container" api --rotate-data-protection-key < /dev/null; then
  docker rm -f "$rotate_container" > /dev/null 2>&1 || true
  echo "ERREUR : la clé Data Protection n'a pas pu être créée." >&2
  exit 1
fi

echo "Copie terminée."

#!/usr/bin/env bash
# Copie la base de prod (inseconds) dans celle du staging (inseconds_staging), puis l'anonymise.
# Lancé par le workflow manuel .github/workflows/staging-db-copy.yml (script envoyé par SSH sur
# le VPS via `bash -s`, donc indépendant du contenu du checkout staging), ou à la main sur le VPS.
# Ne touche jamais la base de prod autrement qu'en lecture (pg_dump).
#
# Anonymisation (la copie vit sur un environnement moins protégé que la prod) :
#   - emails remplacés par player-<id>@example.invalid et rôle admin retiré, sauf l'adresse
#     STAGING_KEEP_EMAIL (.env.staging), pour pouvoir se connecter en staging avec son compte ;
#   - AuthToken de tous les joueurs régénérés : aucun cookie émis en prod ne correspond ;
#   - jetons de magic link / changement d'email supprimés ;
#   - clés Data Protection supprimées : le staging génère les siennes et ne peut pas
#     déchiffrer un cookie de prod (cf. piège 17).
set -euo pipefail

PROD_DIR="${PROD_DIR:-$HOME/apps/InSeconds}"
STAGING_DIR="${STAGING_DIR:-$HOME/apps/InSeconds-staging}"
PG_IMAGE=postgres:17-alpine

read_env() { # read_env <fichier> <clé>
  grep -E "^$2=" "$1" | tail -n1 | cut -d= -f2-
}

prod_pw=$(read_env "$PROD_DIR/.env.prod" INSECONDS_DB_PASSWORD)
staging_pw=$(read_env "$STAGING_DIR/.env.staging" INSECONDS_STAGING_DB_PASSWORD)
keep_email=$(read_env "$STAGING_DIR/.env.staging" STAGING_KEEP_EMAIL)

if [[ -z "$prod_pw" || -z "$staging_pw" ]]; then
  echo "ERREUR : INSECONDS_DB_PASSWORD (.env.prod) ou INSECONDS_STAGING_DB_PASSWORD (.env.staging) manquant." >&2
  exit 1
fi
if [[ -z "$keep_email" ]]; then
  echo "::warning::STAGING_KEEP_EMAIL vide dans .env.staging : aucun compte ne gardera son email, connexion admin impossible en staging."
fi

dump=$(mktemp)
trap 'rm -f "$dump"' EXIT

echo "Dump de la base de prod..."
docker run --rm --network shared-postgres -e PGPASSWORD="$prod_pw" "$PG_IMAGE" \
  pg_dump -h shared-postgres -U inseconds -d inseconds -Fc --no-owner --no-privileges > "$dump"

# L'API staging est arrêtée pendant la restauration : --clean supprime les tables qu'elle
# utilise, et ses jobs de fond pourraient écrire entre la restauration et l'anonymisation.
staging_api_running=false
if [[ "$(docker inspect -f '{{.State.Running}}' inseconds-staging.api 2>/dev/null || true)" == "true" ]]; then
  staging_api_running=true
  docker stop inseconds-staging.api > /dev/null
fi
restart_api() {
  if [[ "$staging_api_running" == "true" ]]; then
    docker start inseconds-staging.api > /dev/null
  fi
}
trap 'restart_api; rm -f "$dump"' EXIT

echo "Restauration dans inseconds_staging..."
# --exit-on-error : un échec partiel laisserait une base à moitié copiée, pas encore anonymisée.
docker run --rm -i --network shared-postgres -e PGPASSWORD="$staging_pw" "$PG_IMAGE" \
  pg_restore -h shared-postgres -U inseconds_staging -d inseconds_staging \
  --no-owner --no-privileges --clean --if-exists --exit-on-error < "$dump"

echo "Anonymisation..."
# Script psql lu sur stdin (et non via -c) : c'est la seule forme où psql substitue :'keep'.
docker run --rm -i --network shared-postgres -e PGPASSWORD="$staging_pw" "$PG_IMAGE" \
  psql -h shared-postgres -U inseconds_staging -d inseconds_staging \
  -v ON_ERROR_STOP=1 -v keep="$keep_email" <<'SQL'
BEGIN;
UPDATE "Players"
   SET "Email" = 'player-' || "Id" || '@example.invalid',
       "IsAdmin" = false
 WHERE "Email" IS NOT NULL
   AND lower("Email") <> lower(:'keep');
UPDATE "Players" SET "IsAdmin" = false WHERE "Email" IS NULL;
UPDATE "Players" SET "AuthToken" = gen_random_uuid();
DELETE FROM "MagicLinkTokens";
DELETE FROM "EmailChangeTokens";
DELETE FROM "DataProtectionKeys";
COMMIT;
SELECT count(*) AS joueurs,
       count(*) FILTER (WHERE "Email" NOT LIKE '%@example.invalid') AS emails_conserves,
       count(*) FILTER (WHERE "IsAdmin") AS admins
  FROM "Players";
SQL

echo "Copie terminée."

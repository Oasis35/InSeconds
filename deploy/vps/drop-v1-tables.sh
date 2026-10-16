#!/usr/bin/env bash
# Suppression des tables v1 du schéma public (PR I1, #235), à lancer à la main sur le VPS, depuis le checkout
# de la cible (~/apps/InSeconds pour la prod, ~/apps/InSeconds-staging pour le staging) :
#
#   ./deploy/vps/drop-v1-tables.sh staging
#   ./deploy/vps/drop-v1-tables.sh prod
#
# En prod, archive d'abord une sauvegarde complète sur R2 (deploy/infra/backup.sh archive, gardée sans limite de
# durée) : sans archive réussie, rien n'est supprimé. Le staging n'est pas sauvegardé (il se recopie depuis la prod).
# Puis deploy/migration-v2/drop-v1-tables.sql, une seule transaction : refusé si la v2 n'est pas notée ouverte ou si
# public contient une table inconnue. Rejouable. L'API n'est pas arrêtée : la v2 ne lit jamais public.
# Après ce script, l'import v1 → v2 et le retour arrière de la bascule ne sont plus possibles.
set -euo pipefail

target="${1:-}"
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
PG_IMAGE=postgres:17-alpine

case "$target" in
  prod)
    env_file=.env.prod db=inseconds db_user=inseconds password_key=INSECONDS_DB_PASSWORD ;;
  staging)
    env_file=.env.staging db=inseconds_staging db_user=inseconds_staging password_key=INSECONDS_STAGING_DB_PASSWORD ;;
  *)
    echo "Usage : $0 <staging|prod>" >&2
    exit 2 ;;
esac

# Passé au conteneur par l'environnement (`-e PGPASSWORD`, sans valeur) : absent de `ps`.
export PGPASSWORD
PGPASSWORD=$(grep -E "^$password_key=" "$env_file" | tail -n1 | cut -d= -f2-) || true
if [[ -z "$PGPASSWORD" ]]; then
  echo "ERREUR : $password_key manquant dans $env_file." >&2
  exit 1
fi

read -r -p "Supprimer définitivement les tables v1 de la base $db ? Taper « $target » pour confirmer : " answer
if [[ "$answer" != "$target" ]]; then
  echo "Abandon : rien n'a été supprimé."
  exit 1
fi

if [[ "$target" == "prod" ]]; then
  echo "Sauvegarde archivée (deploy/infra/backup.sh archive)..."
  ./deploy/infra/backup.sh archive
fi

echo "Suppression des tables v1 de public ($db)..."
docker run --rm -i --network shared-postgres -e PGPASSWORD "$PG_IMAGE" \
  psql -h shared-postgres -U "$db_user" -d "$db" --no-psqlrc -v ON_ERROR_STOP=1 \
  < deploy/migration-v2/drop-v1-tables.sql

echo "Tables v1 supprimées ($target)."

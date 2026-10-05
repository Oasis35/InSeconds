#!/bin/sh
# Import des données v1 (schéma public) dans les schémas v2 (§ 8 du plan v2).
#
# Usage, avec les variables de connexion standard de PostgreSQL :
#   PGHOST=… PGPORT=… PGUSER=… PGPASSWORD=… PGDATABASE=… sh deploy/migration-v2/run-import.sh
#
# Prérequis : les migrations v2 déjà appliquées sur la base (l'API v2 avec --migrate-only).
# Tout se fait dans une seule transaction : l'état de l'import, l'import, puis la vérification.
# Au moindre écart, la vérification lève une exception et rien n'est gardé. Rejouable : l'import
# vide d'abord les tables v2 qu'il remplit.
#
# POSIX sh (pas de bash) : tourne aussi dans l'image postgres:17-alpine, qui fournit psql.
set -eu

dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

# --output : les résultats des SELECT de contrôle ne servent à rien ; les avertissements (NOTICE)
# et les erreurs passent par stderr et restent affichés.
psql --no-psqlrc --quiet --output=/dev/null -v ON_ERROR_STOP=1 --single-transaction \
  -f "$dir/00-import-state.sql" \
  -f "$dir/10-import.sql" \
  -f "$dir/20-verify.sql" \
  -f "$dir/90-import-done.sql"

echo "Import v1 → v2 terminé, vérifications passées."
echo "À lancer maintenant, avant de démarrer l'API v2 : dotnet InSeconds.Api.dll --rotate-data-protection-key"
echo "(les clés de la v1, copiées en clair, ne doivent pas devenir la clé par défaut de la v2, S16)."

#!/bin/sh
# Import des données v1 (schéma public) dans les schémas v2 (§ 8 du plan v2).
#
# Usage, avec les variables de connexion standard de PostgreSQL :
#   PGHOST=… PGPORT=… PGUSER=… PGPASSWORD=… PGDATABASE=… sh deploy/migration-v2/run-import.sh [--force]
#
# Prérequis : les migrations v2 déjà appliquées sur la base (l'API v2 avec --migrate-only).
# Tout se fait dans une seule transaction : l'état de l'import et sa garde, le contrôle de la forme de la source,
# l'import, puis la vérification. Au moindre écart, une exception annule tout et rien n'est gardé. Rejouable :
# l'import vide d'abord les tables v2 qu'il remplit.
#
# --force : importe même si la v2 a été déclarée ouverte aux joueurs (mark-opened.sql). Ce qui a été joué en v2
# est alors effacé : à réserver à un retour arrière décidé.
#
# POSIX sh (pas de bash) : tourne aussi dans l'image postgres:17-alpine, qui fournit psql.
set -eu

force=off
for arg in "$@"; do
  case "$arg" in
    --force) force=on ;;
    *) echo "Option inconnue : $arg (seule --force est acceptée)" >&2; exit 2 ;;
  esac
done

dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

# --output : les résultats des SELECT de contrôle ne servent à rien ; les avertissements (NOTICE)
# et les erreurs passent par stderr et restent affichés. Le -c du début pose la garde pour cette
# transaction seulement (SET LOCAL), lue par 00-import-state.sql.
psql --no-psqlrc --quiet --output=/dev/null -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET LOCAL inseconds.import_force = '$force'" \
  -f "$dir/00-import-state.sql" \
  -f "$dir/05-check-source.sql" \
  -f "$dir/10-import.sql" \
  -f "$dir/20-verify.sql" \
  -f "$dir/90-import-done.sql"

echo "Import v1 → v2 terminé, vérifications passées (réglages compris)."
echo "À lancer maintenant, avant de démarrer l'API v2 :"
echo "  1. dotnet InSeconds.Api.dll --rotate-data-protection-key   (les clés de la v1, copiées en clair, ne doivent pas devenir la clé par défaut, S16)"
echo "  2. dotnet InSeconds.Api.dll --freeze-day-stats             (fige les statistiques des jours terminés, avec les réglages importés)"
echo "  3. psql -v ON_ERROR_STOP=1 -f 30-verify-day-stats.sql       (chaque jour terminé a sa photo, conforme à la v1)"

#!/usr/bin/env bash
# Construit l'image Docker de prod (Dockerfile.prod, nginx) et vérifie les headers
# Cache-Control réellement servis. Régression du 2026-08-15 : sans Cache-Control explicite,
# le navigateur peut garder en cache une ancienne version de i18n/*.json après un déploiement
# (contrairement aux bundles JS/CSS, hashés donc changeant d'URL à chaque build) — des clés de
# traduction manquantes s'affichaient alors en brut dans l'UI ("admin.browserId.label" au lieu
# du texte traduit). Aucun des trois autres niveaux de test (unitaire/intégration/E2E) ne
# construit ni ne sert l'image Docker de prod, donc rien d'autre ne couvre nginx.conf.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE_TAG="inseconds-front-nginx-headers-check"
CONTAINER_NAME="inseconds-front-nginx-headers-check"
PORT="${NGINX_HEADERS_CHECK_PORT:-8099}"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Building Docker image ($IMAGE_TAG)..."
docker build -f Dockerfile.prod -t "$IMAGE_TAG" .

echo "Starting container on port $PORT..."
docker run -d --rm --name "$CONTAINER_NAME" -p "$PORT:8080" "$IMAGE_TAG" >/dev/null

echo "Waiting for the server to respond..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/" >/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Server never became ready" >&2
    docker logs "$CONTAINER_NAME" || true
    exit 1
  fi
  sleep 1
done

fail=0

check_header() {
  local path="$1" expected="$2" actual
  actual=$(curl -sS -D - -o /dev/null "http://localhost:$PORT$path" | tr -d '\r' | grep -i '^cache-control:' | cut -d' ' -f2-)
  if [ "$actual" != "$expected" ]; then
    echo "FAIL $path: expected \"$expected\", got \"$actual\""
    fail=1
  else
    echo "OK   $path -> $actual"
  fi
}

js_file=$(curl -sS "http://localhost:$PORT/" | grep -oE 'main-[A-Za-z0-9]+\.js' | head -1)
if [ -z "$js_file" ]; then
  echo "FAIL: couldn't find a hashed main-*.js reference in index.html"
  fail=1
fi

# Non hashé (i18n, index.html/routes SPA) : toujours revalider — jamais de cache dur.
check_header "/" "no-cache"
check_header "/i18n/fr.json" "no-cache"
check_header "/admin" "no-cache"

# Hashé (nom de fichier change à chaque build) : cache long et immuable, sans risque.
if [ -n "$js_file" ]; then
  check_header "/$js_file" "public, max-age=31536000, immutable"
fi

exit $fail

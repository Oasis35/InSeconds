#!/usr/bin/env bash
# Front v2 : construit l'image de prod (Dockerfile.prod, nginx) et vérifie ce qu'elle sert réellement.
# Reprend le check v1 (src/front/InSeconds.Client/scripts/check-nginx-cache-headers.sh, piège 20)
# et l'étend à la PWA : ngsw.json, le worker et ses variantes de secours sans cache (sinon un joueur
# peut rester sur une ancienne version), et ngsw.json sans aucun dataGroups (S10 : le service
# worker ne met jamais l'API en cache). Aucun autre test ne construit ni ne sert cette image.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE_TAG="inseconds-front-nginx-headers-check"
CONTAINER_NAME="inseconds-front-nginx-headers-check"
PORT="${NGINX_HEADERS_CHECK_PORT:-8098}"
BASE="http://localhost:$PORT"
NO_CACHE="no-cache"

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
  if curl -sf "$BASE/" >/dev/null; then
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "Server never became ready" >&2
    docker logs "$CONTAINER_NAME" || true
    exit 1
  fi
  sleep 1
done

fail=0

header() {
  local path="$1" name="$2"
  curl -sS -D - -o /dev/null "$BASE$path" | tr -d '\r' | grep -i "^$name:" | cut -d' ' -f2- || true
}

check_header() {
  local path="$1" expected="$2" actual
  actual=$(header "$path" cache-control)
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL $path: expected Cache-Control \"$expected\", got \"$actual\""
    fail=1
  else
    echo "OK   $path -> $actual"
  fi
}

check_content_type() {
  local path="$1" expected="$2" actual
  actual=$(header "$path" content-type | cut -d';' -f1)
  if [[ ! "$actual" =~ ^($expected)$ ]]; then
    echo "FAIL $path: expected content-type \"$expected\", got \"$actual\""
    fail=1
  else
    echo "OK   $path -> $actual"
  fi
}

check_status() {
  local path="$1" expected="$2" actual
  actual=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$path")
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL $path: expected HTTP $expected, got $actual"
    fail=1
  else
    echo "OK   $path -> HTTP $actual"
  fi
}

js_file=$(curl -sS "$BASE/" | grep -oE 'main-[A-Za-z0-9]+\.js' | head -1 || true)
if [[ -z "$js_file" ]]; then
  echo "FAIL: couldn't find a hashed main-*.js reference in index.html"
  fail=1
fi

# Non hashé (index.html/routes SPA, traductions) : toujours revalider.
check_header "/" "$NO_CACHE"
check_header "/daily" "$NO_CACHE"
check_header "/admin" "$NO_CACHE"
check_header "/i18n/fr.json" "$NO_CACHE"

# Service worker : jamais de cache dur, même pour les .js (la location dédiée passe avant celle des bundles).
for path in /ngsw.json /ngsw-worker.js /safety-worker.js /manifest.webmanifest; do
  check_status "$path" 200
  check_header "$path" "$NO_CACHE"
done
check_content_type "/ngsw.json" "application/json"
check_content_type "/ngsw-worker.js" "application/javascript|text/javascript"
# Le worker porte l'empreinte de sa CSP (Dockerfile.prod) : il se réinstalle quand elle change.
if curl -sS "$BASE/ngsw-worker.js" | tail -n 1 | grep -Eq '^// CSP [0-9a-f]{16}$'; then
  echo "OK   /ngsw-worker.js -> empreinte de la CSP"
else
  echo "FAIL /ngsw-worker.js: empreinte de la CSP absente"
  fail=1
fi

# Hashé : cache long et immuable.
if [[ -n "$js_file" ]]; then
  check_header "/$js_file" "public, max-age=31536000, immutable"
fi

# S10 : aucun dataGroups dans le manifeste servi (le service worker ne met jamais l'API en cache).
if curl -sS "$BASE/ngsw.json" | node -e '
  const manifest = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  process.exit((manifest.dataGroups ?? []).length === 0 ? 0 : 1);'; then
  echo "OK   /ngsw.json -> aucun dataGroups"
else
  echo "FAIL /ngsw.json: dataGroups non vide (S10)"
  fail=1
fi

# En-têtes de sécurité, sur chaque location.
for path in / /i18n/fr.json /ngsw.json; do
  actual=$(header "$path" x-content-type-options)
  if [[ "$actual" != "nosniff" ]]; then
    echo "FAIL $path: X-Content-Type-Options manquant"
    fail=1
  fi
done
if [[ -n "$js_file" && "$(header "/$js_file" x-frame-options)" != "DENY" ]]; then
  echo "FAIL /$js_file: X-Frame-Options manquant"
  fail=1
fi

# G3 : Content-Security-Policy. Image construite sans argument : en observation (Report-Only), origine de l'API
# de prod. Posée sur chaque location, jamais sous les deux noms à la fois, sans script en ligne autorisé.
for path in / /i18n/fr.json /ngsw.json; do
  report_only=$(header "$path" content-security-policy-report-only)
  enforced=$(header "$path" content-security-policy)
  if [[ -z "$report_only" || -n "$enforced" ]]; then
    echo "FAIL $path: attendu Content-Security-Policy-Report-Only seul (report-only='$report_only', enforce='$enforced')"
    fail=1
  fi
done
if [[ -n "$js_file" ]]; then
  csp=$(header "/$js_file" content-security-policy-report-only)
  for fragment in "script-src 'self' https://static.cloudflareinsights.com;" "connect-src 'self' https://api.inseconds.cc https://*.dzcdn.net https://fonts.googleapis.com https://fonts.gstatic.com https://static.cloudflareinsights.com;" "media-src 'self' blob: https://*.dzcdn.net;" "object-src 'none'" "frame-ancestors 'none'; report-uri https://api.inseconds.cc/api/csp-reports; report-to csp"; do
    if [[ "$csp" != *"$fragment"* ]]; then
      echo "FAIL /$js_file: la CSP ne contient pas \"$fragment\" ($csp)"
      fail=1
    fi
  done
fi
# Rapports de violation envoyés par le navigateur à l'API (report-to) : le groupe « csp » doit être déclaré sur chaque location.
for path in / /i18n/fr.json /ngsw.json; do
  endpoints=$(header "$path" reporting-endpoints)
  if [[ "$endpoints" != 'csp="https://api.inseconds.cc/api/csp-reports"' ]]; then
    echo "FAIL $path: Reporting-Endpoints attendu csp=\"https://api.inseconds.cc/api/csp-reports\" (reçu '$endpoints')"
    fail=1
  fi
done
# Aucun script en ligne dans l'index (sinon la CSP, bloquante, casserait l'app) : balises <script> avec src, pas
# de gestionnaire onload= (la mise en ligne du CSS critique d'Angular en pose un).
index=$(curl -sS "$BASE/")
if grep -oE '<script[^>]*>' <<<"$index" | grep -vq 'src='; then
  echo "FAIL /: script en ligne dans index.html"
  fail=1
fi
if grep -qE ' on(load|click|error)=' <<<"$index"; then
  echo "FAIL /: gestionnaire d'événement en ligne dans index.html"
  fail=1
fi

# robots.txt / sitemap.xml servis tels quels, pas l'index.html du fallback SPA.
check_content_type "/robots.txt" "text/plain"
check_content_type "/sitemap.xml" "text/xml|application/xml"

# L'extrait du faux Deezer des E2E (e2e/public/test-audio.mp3) n'est copié que par la configuration e2e : l'image de prod ne
# l'a pas, l'adresse tombe sur l'index.html du fallback SPA.
check_content_type "/test-audio.mp3" "text/html"

# Ancienne adresse du front (code.run) : 301 vers inseconds.cc, chemin et query gardés, from=legacy
# ajouté pour l'avis « l'adresse a changé » (repris de la v1).
LEGACY_HOST="p01--front--b5cnx77tvxgb.code.run"
check_legacy_redirect() {
  local path="$1" expected="$2" code location
  read -r code location < <(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' -H "Host: $LEGACY_HOST" "$BASE$path")
  location=${location%$'\r'} # curl sous Windows termine la ligne par \r\n
  if [[ "$code" != "301" || "$location" != "$expected" ]]; then
    echo "FAIL $LEGACY_HOST$path: expected 301 to \"$expected\", got $code to \"$location\""
    fail=1
  else
    echo "OK   $LEGACY_HOST$path -> 301 $location"
  fi
}
check_legacy_redirect "/daily" "https://inseconds.cc/daily?from=legacy"
check_legacy_redirect "/account/login/verify?token=abc" "https://inseconds.cc/account/login/verify?token=abc&from=legacy"

exit $fail

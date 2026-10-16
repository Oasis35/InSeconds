#!/usr/bin/env bash
# Test de fumée de l'API v2 après déploiement (PLAN § 12 bis), lancé par deploy.sh sur le staging
# (la prod l'aura à la bascule) : routes de test absentes (S9), en-têtes de sécurité présents
# (S15), tableau de bord /jobs protégé (S3). Interroge l'adresse publique : toute la chaîne
# Cloudflare → Caddy → API est vérifiée.
#
# Usage : ./deploy/vps/smoke-test.sh https://api-dev.inseconds.cc
set -euo pipefail

api="${1:?Usage : $0 https://api-dev.inseconds.cc}"
fail=0

ok() { echo "OK   $1"; }
ko() { echo "FAIL $1" >&2; fail=1; }

# S9 : routes de l'hôte de test (InSeconds.Api.Testing) absentes. /api/e2e/reset est sondée en GET alors
# qu'elle n'existe qu'en POST : présente, elle répondrait 405 sans rien exécuter (jamais de vrai reset de la
# base). /api/auth/dev-login n'est pas sondée : /api/auth/… est une ancienne route de la v1 (LegacyRoutes),
# qui répond 410 en GET même si l'hôte de test était déployé, et un POST l'exécuterait. Le contrôle de
# l'image en CI (job back-v2) couvre les deux.
code=$(curl -s -o /dev/null -w '%{http_code}' "$api/api/e2e/reset")
if [[ "$code" == "404" ]]; then
  ok "/api/e2e/reset absent (404)"
else
  ko "/api/e2e/reset répond HTTP $code au lieu de 404 : hôte de test déployé ? (S9)"
fi

# G2 : les routes de la v1 répondent 410 common.new_version (un onglet resté ouvert sur l'ancien front
# se voit proposer de recharger). Sondée en GET : la route /api/settings n'existe plus en v2.
code=$(curl -s -o /dev/null -w '%{http_code}' "$api/api/settings")
if [[ "$code" == "410" ]]; then
  ok "/api/settings (route de la v1) répond 410"
else
  ko "/api/settings répond HTTP $code au lieu de 410 : routes de la v1 non gérées ? (G2)"
fi

# S15 : en-têtes posés par l'API (InSeconds.Infrastructure/Http/SecurityHeaders.cs).
headers=$(curl -s -D - -o /dev/null "$api/health" | tr -d '\r')
check_header() {
  local name="$1" expected="$2" value
  value=$(grep -i "^$name:" <<<"$headers" | head -1 | cut -d' ' -f2- || true)
  # shellcheck disable=SC2053 # $expected est un motif (ex. max-age=*)
  if [[ "$value" == $expected ]]; then
    ok "$name: $value"
  else
    ko "$name : \"$value\" au lieu de \"$expected\" (S15)"
  fi
}
check_header X-Content-Type-Options "nosniff"
check_header X-Frame-Options "DENY"
check_header Referrer-Policy "no-referrer"
check_header Strict-Transport-Security "max-age=*"
check_header Content-Security-Policy "default-src 'none'*"

# S3 : tableau de bord Hangfire refusé sans cookie admin (401), ou arrêté plus tôt par
# Cloudflare Access s'il le protège (redirection vers sa page de connexion).
read -r code location < <(curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$api/jobs")
location=${location%$'\r'} # curl sous Windows termine la ligne par \r\n
case "$code" in
  401 | 403)
    ok "/jobs protégé ($code)"
    ;;
  302)
    if [[ "${location:-}" == https://*.cloudflareaccess.com/* ]]; then
      ok "/jobs protégé par Cloudflare Access"
    else
      ko "/jobs redirige vers \"${location:-}\" (S3)"
    fi
    ;;
  *)
    ko "/jobs répond HTTP $code : tableau de bord accessible sans être admin ? (S3)"
    ;;
esac

if [[ "$fail" -ne 0 ]]; then
  echo "ERREUR : test de fumée en échec sur $api." >&2
  exit 1
fi
echo "Test de fumée OK sur $api."

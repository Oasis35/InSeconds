#!/usr/bin/env bash
# Étapes post-checkout du déploiement InSeconds (rebuild + nettoyage images + vérification santé).
# Appelé par les jobs `deploy` (prod) et `deploy-staging` de .github/workflows/ci.yml, une fois
# le repo déjà positionné sur le commit à déployer (git fetch/checkout/reset --hard fait avant,
# côté ci.yml — ce script ne touche jamais à l'état git, seulement à Docker et à la
# vérification post-déploiement).
#
# Usage : ./deploy/vps/deploy.sh [prod|staging]   (défaut : prod)
#
# M17 (revue du 25/09) : extrait de la commande SSH inline pour (a) garder la commande SSH
# minimale — préalable à une restriction future de la clé de déploiement via `command=` dans
# authorized_keys (cf. CLAUDE.md racine § Déploiement VPS), et (b) ajouter le nettoyage des
# images Docker + la vérification de santé post-déploiement, absents jusqu'ici.
set -euo pipefail

target="${1:-prod}"
case "$target" in
  prod)
    compose_file=docker-compose.prod.yml
    env_file=.env.prod
    api_url=https://api.inseconds.cc/health
    front_url=https://inseconds.cc
    ;;
  staging)
    compose_file=docker-compose.staging.yml
    env_file=.env.staging
    api_url=https://api-dev.inseconds.cc/health
    # Protégé par Cloudflare Access : répond 302 vers la page de connexion, ce que `curl -sf`
    # (sans -L) considère comme un succès. Suffit à vérifier que Cloudflare → Caddy répond ;
    # l'état réel du conteneur front est vérifié juste après via `docker inspect`.
    front_url=https://dev.inseconds.cc
    ;;
  *)
    echo "Usage : $0 [prod|staging]" >&2
    exit 2
    ;;
esac

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

compose() { docker compose -f "$compose_file" --env-file "$env_file" "$@"; }

export BUILD_TIME
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

compose up -d --build

# Ne retire que les images "dangling" (non taguées) — jamais -a, qui supprimerait aussi les
# images d'autres projets partageant ce VPS (cf. CLAUDE.md racine § Architecture — plusieurs
# stacks Compose indépendants sur le même hôte). Le rebuild ci-dessus délaisse le tag
# `latest` de l'ancienne image sans la supprimer ; sans ce nettoyage régulier, ces images
# orphelines s'accumulent et finissent par saturer les 40 Go de disque.
docker image prune -f
# Cache de build (couches npm ci / dotnet restore / publish de chaque déploiement) : jamais
# nettoyé jusqu'au 2026-09-28, il avait atteint 25 Go sur 40. On garde les 3 derniers jours
# pour que les builds suivants restent rapides.
docker builder prune -f --filter until=72h

echo "Vérification de la santé de l'API ($target) après déploiement..."
healthy=false
for i in $(seq 1 20); do
  if curl -sf "$api_url" > /dev/null; then
    healthy=true
    break
  fi
  echo "  API pas encore prête (tentative $i/20)..."
  sleep 3
done
if [[ "$healthy" != "true" ]]; then
  echo "ERREUR : l'API ne répond pas sur $api_url après déploiement." >&2
  compose logs --tail=80 api >&2 || true
  exit 1
fi

if ! curl -sf -o /dev/null "$front_url"; then
  echo "ERREUR : le front ne répond pas sur $front_url après déploiement." >&2
  compose logs --tail=80 front >&2 || true
  exit 1
fi

if [[ "$(docker inspect -f '{{.State.Running}}' "$(compose ps -q front)")" != "true" ]]; then
  echo "ERREUR : le conteneur front ($target) ne tourne pas après déploiement." >&2
  compose logs --tail=80 front >&2 || true
  exit 1
fi

echo "Déploiement $target vérifié OK (API + front répondent)."

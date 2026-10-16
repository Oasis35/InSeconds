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
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# La prod restait en v1 jusqu'à la bascule (16/10/2026 ; workflow « Bascule v2 » retiré en I1, #235) : tant que le
# marqueur .bascule-v2-done n'existe pas, un push sur main redéploie la v1 (docker-compose.prod.yml), jamais
# la v2 sans import. La bascule pose le marqueur une fois la v2 ouverte aux joueurs ; ensuite, les déploiements
# de main sont ceux de la v2. INSECONDS_V2=1 force ce mode (posé par la bascule elle-même, avant le marqueur).
# Le staging est en v2 depuis A6.
v2=false
if [[ "$target" == "staging" || "${INSECONDS_V2:-}" == "1" || -f .bascule-v2-done ]]; then
  v2=true
fi

case "$target" in
  prod)
    if [[ "$v2" == "true" ]]; then
      compose_file=docker-compose.prod-v2.yml
    else
      compose_file=docker-compose.prod.yml
    fi
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

compose() { docker compose -f "$compose_file" --env-file "$env_file" "$@"; }

export BUILD_TIME
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [[ "$v2" == "true" ]]; then
  # v2 : le staging (PR A6) et la prod après la bascule. Tout est vérifié avant de remplacer les conteneurs : en cas d'échec,
  # la version en place continue de tourner.
  #
  # Certificat Data Protection (PLAN S16), chargé par l'API au démarrage : absent ou illisible, elle
  # ne démarrerait pas. Contrôlé ici d'abord, avant que Docker ne crée un dossier vide à la place
  # d'un fichier absent, puis dans le conteneur.
  cert=secrets/dataprotection.pfx
  if [[ ! -f "$cert" ]]; then
    echo "ERREUR : $cert absent du checkout (cf. $env_file.example)." >&2
    exit 1
  fi
  compose build
  if ! compose run --rm -T --entrypoint sh api -c "test -f /run/secrets/dataprotection.pfx && test -r /run/secrets/dataprotection.pfx"; then
    echo "ERREUR : $cert illisible par l'utilisateur de l'image de l'API (uid/gid 1654), cf. $env_file.example." >&2
    exit 1
  fi
  # --migrate-only ne démarre ni le serveur HTTP, ni Wolverine, ni Hangfire (leurs schémas sont
  # créés au démarrage de l'API).
  echo "Application des migrations ($target)..."
  compose run --rm -T api --migrate-only
  compose up -d
else
  compose up -d --build
fi

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

if [[ "$v2" == "true" ]]; then
  bash deploy/vps/smoke-test.sh "${api_url%/health}"
fi

echo "Déploiement $target vérifié OK (API + front répondent)."

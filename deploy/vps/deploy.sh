#!/usr/bin/env bash
# Étapes post-checkout du déploiement InSeconds (rebuild + nettoyage images + vérification santé).
# Appelé par le job `deploy` de .github/workflows/ci.yml, une fois le repo déjà positionné
# sur le commit à déployer (git fetch/checkout/reset --hard fait avant, côté ci.yml — ce
# script ne touche jamais à l'état git, seulement à Docker et à la vérification post-déploiement).
#
# M17 (revue du 25/09) : extrait de la commande SSH inline pour (a) garder la commande SSH
# minimale — préalable à une restriction future de la clé de déploiement via `command=` dans
# authorized_keys (cf. CLAUDE.md racine § Déploiement VPS), et (b) ajouter le nettoyage des
# images Docker + la vérification de santé post-déploiement, absents jusqu'ici.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

export BUILD_TIME
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Ne retire que les images "dangling" (non taguées) — jamais -a, qui supprimerait aussi les
# images d'autres projets partageant ce VPS (cf. CLAUDE.md racine § Architecture — plusieurs
# stacks Compose indépendants sur le même hôte). Le rebuild ci-dessus délaisse le tag
# `latest` de l'ancienne image sans la supprimer ; sans ce nettoyage régulier, ces images
# orphelines s'accumulent et finissent par saturer les 40 Go de disque.
docker image prune -f

echo "Vérification de la santé de l'API après déploiement..."
healthy=false
for i in $(seq 1 20); do
  if curl -sf https://api.inseconds.cc/health > /dev/null; then
    healthy=true
    break
  fi
  echo "  API pas encore prête (tentative $i/20)..."
  sleep 3
done
if [ "$healthy" != "true" ]; then
  echo "ERREUR : l'API ne répond pas sur https://api.inseconds.cc/health après déploiement." >&2
  docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=80 api >&2 || true
  exit 1
fi

if ! curl -sf -o /dev/null https://inseconds.cc; then
  echo "ERREUR : le front ne répond pas sur https://inseconds.cc après déploiement." >&2
  docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=80 front >&2 || true
  exit 1
fi

echo "Déploiement vérifié OK (API + front répondent)."

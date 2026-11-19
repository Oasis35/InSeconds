---
paths:
  - "deploy/**"
  - ".github/**"
  - "docker-compose*.yml"
  - "**/Dockerfile*"
  - "src/front/InSeconds.Client/nginx/**"
  - "src/front/InSeconds.Client/scripts/check-nginx-headers.sh"
  - "docs/exploitation/**"
---
# Déploiement, CI et VPS

Référence complète (durcissement, stacks, staging, sauvegardes, restauration, commandes) : [`docs/exploitation/deploiement.md`](../../docs/exploitation/deploiement.md) ; CI : [`docs/exploitation/ci.md`](../../docs/exploitation/ci.md). Ce fichier ne garde que les règles et pièges à avoir en tête avant de toucher à ces fichiers.

## Règles

- **L'IP publique du VPS n'est jamais écrite dans le dépôt** (ni doc, ni code, ni workflow) : elle vit dans `~/.ssh/config` (alias `vpsovh`), le secret `VPS_HOST` et le DNS Cloudflare.
- **La CI ne touche jamais `deploy/infra` ni `deploy/caddy`** : Postgres partagé, Caddy et timers de sauvegarde se déploient à la main (`deploy/infra/README.md`, `deploy/caddy/README.md`). Le VPS est partagé avec d'autres projets.
- **Tout passe par `deploy/vps/deploy.sh`** (prod sur `main`, staging sur `env/staging`, après « CI OK ») : certificat Data Protection vérifié, migrations par `--migrate-only` avant de remplacer les conteneurs, test de fumée (`smoke-test.sh`), santé.
- **Staging** : `ASPNETCORE_ENVIRONMENT=Staging` (jamais `Development` ni `Testing`, l'API est publique), `EmailRedirect:To` obligatoire (l'API refuse de démarrer sans : la base est une copie de la prod), aucune variable `OTEL_*`, `catalogue-refresh` jamais lancé et `Catalogue:Waveform:ComputeOnAdd=false` (même IP que la prod, même quota Deezer, piège 16), tâches de nuit 30 min après la prod. Projet healthchecks.io à part (« [Dev]InSeconds »).
- **Copie prod → staging** (workflow « Copy prod DB to staging », `copy-prod-db-to-staging.sh`) : schémas de l'application seulement, jamais `infra.data_protection_keys` ; puis `staging-anonymize.sql` et une clé Data Protection neuve. **Toute nouvelle colonne de texte libre ou d'identité doit être anonymisée par ce script** (`MigrationTests/StagingAnonymizeTests`).
- **Sauvegardes** (`deploy/infra/backup.sh` à 3 h, `backup-verify.sh` à 4 h, timers systemd installés à la main, prod seulement) : chaque passage écrit une ligne dans `infra.backup_runs` par `record_run` de `backup-common.sh` ; **une colonne de `BackupRun` changée doit suivre dans ce script** (`MigrationTests/BackupScriptsTests`).
- **`/sitemap.xml`** du domaine du front est envoyé par Caddy à l'API (prod et staging) : un changement de cette route se redéploie à la main avec `deploy/caddy`.
- **Un nouveau job CI entre dans les `needs` de « CI OK »**, seul check exigé par le ruleset.

## Pièges

**Piège 2 : healthcheck PostgreSQL** - `pg_isready` dans le conteneur (`docker-compose.yml`, `deploy/infra`) ; sans lui, l'API démarre avant que la base n'accepte les connexions.

**Piège 20 : `Cache-Control` nginx** - bundles hashés en `public, max-age=31536000, immutable`, tout le reste (`index.html`, `i18n/*.json`, fichiers du service worker, `manifest.webmanifest`) en `no-cache`, sinon un navigateur garde de vieilles traductions après un déploiement. nginx n'hérite pas des `add_header` du niveau `server` dans une `location` qui a les siens : les en-têtes de sécurité sont inclus dans chaque `location` (`security-headers.conf`). Vérifié par `scripts/check-nginx-headers.sh` (job CI `nginx-headers`, seul à servir l'image de prod).

**Piège 25 : cache Docker et horodatage du build** - une commande non déterministe dans un `RUN` n'est pas rejouée si les couches d'avant n'ont pas changé. `deploy.sh` exporte `BUILD_TIME` et `GIT_COMMIT` à chaque déploiement, passés en arguments de build au front (`ng build --define`) et à l'API (`BUILD_COMMIT`, lu par `GET /api/admin/system`), ce qui invalide la couche.

**Piège 26 : `caddy reload` ne suffit pas après un `git reset --hard` sur le Caddyfile** - le fichier est monté seul en bind mount, lié à l'inode d'origine ; git le remplace (nouvel inode) et Caddy relit l'ancien (`config is unchanged`). Faire `docker restart caddy` (certificats gardés dans leurs volumes).

**Piège 34 : `trusted_proxies` dans le Caddyfile** - sans lui, Caddy remplace `X-Forwarded-For` par l'IP du edge Cloudflare. Bloc global `servers { trusted_proxies cloudflare {…} }`, module `caddy-cloudflare-ip` dans l'image Caddy (`deploy/caddy/Dockerfile`), rebuild manuel. Côté API : piège 27.

**Piège 43 : déploiement par la CI** - clé d'hôte SSH épinglée (secret `VPS_SSH_HOST_KEY`, sinon `ssh-keyscan` avec avertissement), `docker image prune -f` (jamais `-a` : d'autres projets partagent le VPS), groupe de concurrency propre au déploiement (`cancel-in-progress: false` : un déploiement n'est jamais coupé en plein rebuild), santé vérifiée après. Tout est dans `deploy/vps/deploy.sh` et l'action `.github/actions/vps-ssh`.

**Piège 49 : le service worker garde la CSP de son installation** - un service worker applique à ses propres requêtes la CSP reçue avec son script, et le navigateur ne le réinstalle que si ce script change. Toute origine tierce lue par la page (extraits, pochettes, Google Fonts) doit donc aussi être en `connect-src` (`nginx/csp.conf.template`), et `Dockerfile.prod` ajoute l'empreinte de la CSP (ses en-têtes, sans les commentaires) à la fin de `ngsw-worker.js`. Côté front : `.claude/rules/front/core-pwa.md`.

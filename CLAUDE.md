# CLAUDE.md — InSeconds

Instructions pour Claude quand il travaille dans ce repo. Pour la documentation utilisateur, voir [README.md](README.md) / [README.fr.md](README.fr.md).

## Vue d'ensemble

InSeconds = blind test musical quotidien. N morceaux par jour (`Daily:TracksPerChallenge`, défaut 5). La lecture démarre au palier le plus court et le joueur prolonge l'écoute s'il le veut (paliers : 0.5, 1, 1.5, 2, 3, 5, 10 s) avant de tenter artiste + titre. Moins de temps écouté = plus de points. Même défi pour tout le monde, même jour (jour UTC). Mode invité (joue sans s'inscrire), comptes optionnels par lien magique. Règles produit : [`docs/GAMEPLAY_RULES_FR.md`](docs/GAMEPLAY_RULES_FR.md).

Stack : .NET 10 / Wolverine / EF Core / PostgreSQL 17 / Hangfire côté back (monolithe modulaire), Angular 22 zoneless / NgRx SignalStore / Tailwind v4 / élément audio HTML côté front (PWA). **Hébergé sur un VPS OVH** (Debian 13, Gravelines) : front + API + PostgreSQL en conteneurs Docker derrière Caddy et Cloudflare, détail dans [Déploiement VPS](#déploiement-vps). Domaine public : `https://inseconds.cc` (API : `https://api.inseconds.cc`). **La page de rebond GitHub Pages (`oasis35.github.io/InSeconds`) a été retirée**, ne pas la recréer.

## État du dépôt

Le code est dans `src/` (la **v2**, en production depuis le 16/10/2026), décrite par ce fichier et ses deux compagnons : [`src/back/CLAUDE.md`](src/back/CLAUDE.md) et [`src/front/CLAUDE.md`](src/front/CLAUDE.md). Plans et décisions : [`docs/refonte-v2/PLAN.md`](docs/refonte-v2/PLAN.md) (le « quoi ») et [`docs/refonte-v2/DEVELOPPEMENT.md`](docs/refonte-v2/DEVELOPPEMENT.md) (le découpage en PR, les décisions prises PR par PR). Avancement : ticket GitHub #205 et ses sous-tickets (étiquette `refonte-v2`).

- **Staging** (`dev.inseconds.cc`) : sert la v2 depuis la PR A6.
- **Prod** (`inseconds.cc`) : sert la **v2** depuis la bascule du **16/10/2026** (phase H, workflow « Bascule v2 », cf. [Bascule v1 → v2](#bascule-v1--v2)). Les push sur `main` déploient la v2.
- **Ancienne version (v1) supprimée** en I2 (#236) : son code, ses jobs CI, ses E2E, puis les scripts de l'import v1 → v2 (historique git) ; la v2 est passée de `src/v2` à `src`. Le schéma v1, dont `DropV1TablesTests` a besoin tant que les tables v1 existent en prod, est figé dans `src/back/tests/InSeconds.MigrationTests/v1-schema.sql`.
- **PR** : vers `env/staging` (testée au staging), puis `env/staging` → `main` pour la prod. Une PR d'une étape de la refonte porte l'étiquette `refonte-v2` et une description qui commence par `Closes #<ticket de l'étape>` puis `Part of #205`. La base n'étant pas `main`, GitHub ne ferme pas le ticket : le fermer à la main au merge.
- Branches `main` et `env/staging` protégées (ruleset GitHub : PR obligatoire, pas de force-push ni de suppression, check « CI OK » exigé).

## Ports (ATTENTION — non standards)

| Service | Port |
|---------|------|
| API (`dotnet run`, hôte de test compris) | **5175** |
| Front (`ng serve`) | **5176** |
| API de test des E2E en local / front des E2E en local | **5177** / **5178** (5175 / 5176 en CI) |
| PostgreSQL | **5432** |

Tous les ports InSeconds en `51xx` par convention (4200 est pris par d'autres projets). Si tu modifies un port, propage partout : `launchSettings.json`, `angular.json`, `proxy*.conf.json`, `playwright.config.ts`, `Auth:TrustedOrigins` de l'hôte de test, READMEs.

## Structure repo

```
InSeconds/
├── docker-compose.yml              # dev local : PostgreSQL
├── docker-compose.staging.yml      # staging
├── docker-compose.prod.yml         # prod
├── deploy/
│   ├── infra/                      # Postgres partagé du VPS, sauvegardes
│   ├── caddy/                      # reverse proxy partagé
│   └── vps/                        # deploy.sh, smoke-test.sh, copie prod → staging (+ staging-anonymize.sql), suppression des tables v1 (drop-v1-tables.sh/.sql)
├── docs/                           # COMMENCE_ICI (sommaire), GAMEPLAY_RULES (spec produit), TACHES, refonte-v2/
├── src/
│   ├── back/                       # InSeconds.slnx : Api (modules), Infrastructure, Deezer, Api.Testing, tests/
│   └── front/InSeconds.Client/     # app Angular
└── README.md / README.fr.md
```

## Architecture back

> Détail complet (chaque module, routes, tâches, authentification, import, hôte de test) : [`src/back/CLAUDE.md`](src/back/CLAUDE.md). Ci-dessous : les règles qu'il faut avoir en tête avant de toucher au code.

**Monolithe modulaire.** Une seule API (`InSeconds.Api`), découpée en modules dans `Modules/<Module>/` :

| Module | Rôle | Schéma |
|---|---|---|
| `Players` | invités, comptes, appareils (sessions), cookie, lien magique, rôle admin | `players` |
| `Catalogue` | les morceaux du pool, leurs données Deezer, l'état de leur extrait | `catalogue` |
| `Gameplay` | la mécanique d'un morceau (manche, correction, indices, tirage) : logique pure, ni table ni route | — |
| `Daily` | le défi du jour, les parties, le score, la série et les gels, les statistiques, l'admin du jeu | `daily` |

Chaque module a ses couches `Domain/` (entités aux invariants encapsulés, ports), `Application/` (endpoints, handlers), `Persistence/` (EF), `Contracts/` (ce que les autres modules ont le droit d'utiliser). Projets autour : `InSeconds.Infrastructure` (email, observabilité, proxies, rate limiting, CORS, en-têtes : ne connaît ni l'API ni les modules), `InSeconds.Deezer` (client Deezer en trois ports, avec cache : ne connaît rien d'autre), `InSeconds.Api.Testing` (hôte de test : faux email, faux Deezer, routes `/api/e2e`, documents OpenAPI ; jamais dans l'image de prod).

### Règles dures (vérifiées en CI)

- **Un module n'utilise des autres que leur dossier `Contracts/`** ; `Gameplay` ne connaît aucun mode ; `Catalogue` et `Gameplay` ne connaissent pas `Daily` ; un noyau ne voit d'un mode que ses `Contracts` (Players → `Daily.Contracts.IStreakGrants`). Tests d'architecture (`tests/InSeconds.ArchitectureTests`, NetArchTest). Pas de navigation EF entre modules : des identifiants, et des clés étrangères déclarées par le nom du type.
- **Rien dans le schéma `public`** (tables v1 jusqu'à I1) ; chaque entité déclare son schéma ; noms en snake_case.
- **Jamais `DateTime.UtcNow`/`Now`/`Today`** dans `InSeconds.Api` : `TimeProvider` ou `IGameCalendar` (`ClockUsageTests`).
- **Pas de repository générique** : chaque module a ses ports nommés par l'intention (`IPlayerStore`, `IDailyStore`, `ICatalogueQueries`…).
- **Endpoints en Wolverine.Http**, en étapes `LoadAsync` / `Validate` / `Post`, validation FluentValidation, **jamais de `SaveChangesAsync` dans un handler** (transaction Wolverine, outbox dans le schéma `messaging` ; exceptions écrites : `SettingsStore.SetAsync`, la reprise des cookies v1, `--freeze-day-stats`) et **jamais d'`IResult`** (`[EmptyResponse]` pour un 204), vérifiés par `HandlerRulesTests`. Toute route `/api/admin*` reçoit la policy Admin automatiquement.
- **Code Wolverine généré commité** (`Internal/Generated`, codegen statique en prod et staging) : après tout ajout ou changement de handler, `rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write`. Le job CI `back` échoue s'il est périmé, et l'API refuse de démarrer en staging.
- **Erreurs** : ProblemDetails avec `code` stable (`module.raison`, ex. `daily.already_played`) et `traceId`. **Ne jamais renommer un code publié** (le front les traduit).
- **Pièges audio, sécurité, Deezer** : un piège = un test nommé (cf. [Pièges connus](#pièges-connus)).
- **Tests** : `Assert` de xUnit (pas de FluentAssertions), une base neuve par classe de tests d'intégration (Testcontainers).

### Réglages (`infra.settings`)

Une ligne par réglage : `key` = chemin de configuration complet, `value` en `jsonb`. Chargés dans `IConfiguration`, lus par `IOptionsMonitor<T>` : **tout est relu à chaud**. Écrire un réglage : `SettingsStore.SetAsync(key, value)`. Ajouter un réglage = une propriété dans les options du module avec sa valeur par défaut (aucune ligne en base nécessaire) ; **pas de valeur initiale sur une liste ou un dictionnaire** (le binder ajoute aux éléments lus : défaut dans une propriété `Effective…`), et **pas de clé de dictionnaire décimale** (le binder laisse le dictionnaire vide sans erreur). Détail : `src/back/CLAUDE.md` § Réglages.

| Clé | Défaut | Remarque |
|-----|--------|----------|
| `Daily:GuessTimerSeconds` | `20` | exposé, appliqué nulle part (cf. GAMEPLAY_RULES) |
| `Daily:AllowedDurationsSeconds` | `[0.5,1,1.5,2,3,5,10]` | |
| `Daily:TracksPerChallenge` | `5` | ne change que les défis à venir (piège 38) |
| `Daily:DurationScores` | `[{"seconds":0.5,"score":1000},{"seconds":1,"score":850},…,{"seconds":10,"score":100}]` | liste d'objets |
| `Daily:TrackCooldownDays` | `30` (40 en prod) | modifiable depuis l'onglet Actions de l'admin |
| `Daily:HintUnlockDurationsSeconds` | `[5,10]` | |
| `Daily:HintPenaltyPercent` | `{"1":30,"2":60}` | |
| `Daily:StreakFreezeEveryDays` / `StreakFreezeMax` / `StreakLostNudgeMinDays` | `7` / `2` / `2` | gel de série |
| `Catalogue:CoverUrlTemplate` | `https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg` | |
| `Catalogue:Refresh:BatchSize` / `BatchDelay` | `10` / 1,5 s | cadence du contrôle nocturne des extraits |

L'API refuse de démarrer si les réglages du jeu sont incohérents (`DailyOptionsStartupCheck`).

### Tâches planifiées (Hangfire, schéma `jobs`)

| Tâche | Cron (UTC) | Rôle |
|---|---|---|
| `catalogue-refresh` | `0 23 * * *` (jamais en staging : même IP que la prod, piège 16) | recontrôle l'extrait et le rang Deezer des morceaux tirables demain |
| `daily-generate-challenge` | `0 0 * * *` | génère le défi du jour ; pool insuffisant : réessai toutes les 10 min pendant 24 h |
| `daily-close-day` | `5 0 * * *` | expire les parties restées en cours, fige les statistiques de J-2 et avant |
| `players-purge-expired-tokens` | `30 3 * * *` | supprime les jetons expirés (lien de connexion et changement d'email) |

En staging, les trois autres tâches tournent **30 min après la prod** (0 h 30, 0 h 35 et 4 h UTC, `appsettings.Staging.json`), pour que les deux instances du VPS ne travaillent jamais en même temps sur le même Postgres ; entre minuit et 0 h 30, le défi du staging est généré à la volée au premier « Commencer ». Les horaires attendus du projet healthchecks.io « [Dev]InSeconds » suivent ce décalage.

Tableau de bord `/jobs` (admin seulement, à protéger aussi par Cloudflare Access avant la mise en prod) : c'est là qu'on lance une tâche à la main. L'onglet Actions de l'admin n'affiche que le dernier passage de chaque tâche (`GET /api/admin/jobs/last-runs`).

## Architecture front

> Détail complet (domaines, stores, lecteur audio, E2E, clients NSwag) : [`src/front/CLAUDE.md`](src/front/CLAUDE.md).

Angular 22 standalone, **zoneless** (la détection de changement ne part que des signals, des événements du template ou d'un `markForCheck()`), NgRx SignalStore, ngx-translate (FR/EN), CDK Dialog, lecteur audio sur un élément `Audio` (celui de la v1, #309), service worker (PWA, nouvelle version appliquée à un moment sûr). Tests : Vitest en mode navigateur (Chromium).

- **Domaines** calqués sur les modules du back : `account`, `gameplay` (la manche, partagée par les modes), `daily`, `admin`, plus `core/` (transverse) et `ui/` (kit visuel). Chacun en quatre couches : `domain/` (TypeScript pur), `data-access/` (stores, adaptateurs API), `feature/` (pages routées), `ui/` (présentation).
- **Frontières vérifiées par Sheriff** (`npm run lint:arch`, job CI `front`) : `ui` n'importe que `ui`, `core` n'importe aucun domaine, seul `data-access` importe les clients générés, `gameplay` n'importe aucun mode, `domain/` sans Angular ni RxJS.
- **Un client NSwag par module** (`src/app/api/<module>/api.generated.ts`, **fichier généré commité**), produit depuis le document OpenAPI sauvegardé par l'hôte de test. Après tout changement d'endpoint : régénérer le document côté back, puis `npm run generate-api`, et commiter les deux.
- **Erreurs** : `ERROR_MESSAGE_KEYS` (`core/errors/error-messages.ts`) est la seule table code → message ; un code inconnu s'affiche avec son `traceId`. Remontée des erreurs JS, des 5xx et des violations CSP vers `POST /api/client-errors`.
- Routes : `/` → `/daily` ; `/account/**`, `/admin/**`, `/privacy` ; les adresses de la v1 (`/blindtest`, `/login`, `/profile`, `/confidentialite`…) sont redirigées en gardant la query string.

### Conventions

- Couleurs par `var(--…)` (tokens `:root` de `styles.scss`, jamais de hex dans un template), hovers par `hover:` Tailwind.
- Un composant = un dossier avec `.ts` (+ `.html` s'il est long), `ChangeDetectionStrategy.OnPush`, écouteurs globaux dans `host: {}`, `TranslatePipe` dans chaque composant qui affiche du texte.
- État exposé en lecture seule, modifié par les méthodes du store ; un nom d'état ne doit pas être celui d'une méthode du même store.
- Modales **uniquement** par `ModalService` (avec `injector: inject(Injector)` pour retrouver les stores de la page), boutons par `appButton`.
- Mobile first : toute proposition d'écran se pense d'abord pour un téléphone. Champs de saisie à 16 px au moins sur écran tactile (sinon Safari sur iPhone zoome au toucher et garde le zoom ; règle `@media (pointer: coarse)` de `styles.scss`).

## Modèle de données

Même base PostgreSQL que la v1 (`inseconds` en prod, `inseconds_staging` en staging), avec un schéma par module. Les tables v1 restent dans `public` jusqu'à leur suppression par `deploy/vps/drop-v1-tables.sh <staging|prod>` (I1, #235 ; en prod, après une sauvegarde archivée par `backup.sh archive`), lancé à la main sur le VPS.

| Schéma | Tables |
|---|---|
| `players` | `players` (un invité = un joueur sans compte, suppression logique `deleted_at`), `accounts` (`email` et `pseudo` en `citext` uniques, `is_admin`), `device_sessions` (un appareil connecté, révocable), `legacy_tokens` (reprise des cookies v1, supprimée en I3), `auth_tokens` (lien de connexion et changement d'email, hachés) |
| `catalogue` | `tracks` (`deezer_track_id` unique, `cover_hash` seul, `release_year`, `deezer_rank`, `preview_status` 0 inconnu / 1 disponible / 2 absent, `disabled_at`) |
| `daily` | `challenges` (`date` unique, `seed`, `origin`), `challenge_tracks` (PK `(challenge_id, position)`), `sessions` (unique `(player_id, challenge_id)`, `status` 0 en cours / 1 terminée / 2 abandonnée / 3 expirée, verrou du morceau en cours), `answers` (PK `(session_id, position)`), `streaks`, `challenge_day_stats` (photo figée d'un jour terminé, `payload jsonb`) |
| `infra` | `settings`, `data_protection_keys` (chiffrées par certificat), `__ef_migrations_history`, `import_state` (import v1 → v2) |
| `messaging` | outbox et files durables de Wolverine (créées par Wolverine au démarrage, pas par les migrations) |
| `jobs` | tables de Hangfire (créées par Hangfire au démarrage) |
| `extensions` | `citext` (ce schéma doit être dans le `search_path`, cf. `src/back/CLAUDE.md` § Règles) |

- **L'usage d'un morceau** (dernière date, nombre d'usages, cooldown) n'est pas stocké : il se calcule sur `challenge_tracks`.
- **Les statistiques d'un jour terminé (J-2 et avant) sont figées** dans `challenge_day_stats` par la tâche `daily-close-day`, recalculables depuis l'admin. La veille et le jour même restent calculés en direct (une partie de la veille peut encore se finir après minuit, piège 18).
- **Statuts de partie** : « abandonnée » = clic sur « Abandonner » ; « expirée » = partie laissée en cours sur un défi passé. Les stats admin distinguent les deux.
- **Anti-rejeu** : une partie par joueur et par défi. **Scoring partiel** : artiste et titre corrigés séparément.
- **Migrations EF** appliquées au démarrage de l'API (`DatabaseStartupService`) ou par `--migrate-only` (déploiement).

## Commandes courantes

```bash
# PostgreSQL local (le service database du compose ; .env avec DB_PASSWORD)
docker compose up -d database

# Back (depuis src/back)
dotnet build InSeconds.slnx
dotnet test --solution InSeconds.slnx           # unitaires + architecture + intégration + scripts SQL du VPS (Docker requis)
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=inseconds;Username=inseconds;Password=<DB_PASSWORD>" \
  dotnet run --project InSeconds.Api.Testing     # hôte de test sur :5175 (faux Deezer, faux email, /api/e2e, dev-login)
(cd InSeconds.Api && dotnet ef migrations add <Nom> --output-dir Infrastructure/Persistence/Migrations)
rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write   # après un changement de handler

# Front (depuis src/front/InSeconds.Client ; Node ≥ 22.22.3)
npm ci
npm start                    # :5176, /api /health /jobs relayés vers :5175
npx ng test --watch=false    # Vitest dans Chromium
npm run lint:arch            # frontières Sheriff
npm run build
npm run generate-api         # clients NSwag, depuis les documents OpenAPI sauvegardés par le back
E2E_DB_CONNECTION="Host=localhost;…;Database=inseconds_e2e;…" npm run e2e   # Playwright : démarre l'hôte de test (:5177) et ng serve (:5178)
```

Détail des options de l'API (`--migrate-only`, `--rotate-data-protection-key`, `--freeze-day-stats`) : `src/back/CLAUDE.md` § Démarrage.

## Déploiement VPS

VPS OVH (`VPS-1 2027`, 2 vCores, 4 Go RAM, 40 Go, Debian 13 Trixie, zone Gravelines/GRA). Accès SSH (user `debian`) par **deux moyens, tous deux actifs** : la clé SSH (`ssh vpsovh`, inchangé) **et** le login + mot de passe de `debian` (gardé volontairement depuis le 2026-10-11 comme accès de secours si le PC qui porte la clé est perdu, cf. § Durcissement serveur). **L'IP publique du VPS n'est jamais écrite dans le dépôt** (ni doc, ni code, ni workflow) : le proxy Cloudflare sert justement à la cacher, la publier permettrait de contourner Cloudflare (WAF, anti-DDoS) en tapant directement Caddy. Elle vit uniquement dans le `~/.ssh/config` local (alias `vpsovh`), le secret GitHub `VPS_HOST` et le DNS Cloudflare. Elle a figuré dans ce fichier jusqu'au 2026-09-25 et reste donc dans l'historique git.

### Durcissement serveur

- **SSH** : `/etc/ssh/sshd_config.d/10-hardening.conf` (`PasswordAuthentication yes` depuis le 2026-10-11, `PermitRootLogin no`, `KbdInteractiveAuthentication no`). La connexion par clé reste active **et** la connexion par login + mot de passe est gardée volontairement (décision de Clément, testée le 2026-10-11 avec `ssh -o PubkeyAuthentication=no`) pour garder un accès sans la clé SSH du PC ; mot de passe long de `debian` rangé dans le KeePass de Clément, avec le nom d'hôte OVH du VPS (jamais écrit dans le dépôt : il résout vers l'IP) et l'empreinte de la clé d'hôte. Protection restante : fail2ban (ci-dessous) et root interdit. Retour à la clé seule : remettre `PasswordAuthentication no` puis `sudo systemctl reload ssh`. Secours si SSH est inaccessible : console KVM de l'espace client OVH (clavier serveur passé en AZERTY via `/etc/default/keyboard` + `setupcon`) ou mode rescue. **Nommé `10-` et pas `99-`** — piège : `sshd` retient la *première* valeur rencontrée pour chaque directive dans l'ordre du glob `Include /etc/ssh/sshd_config.d/*.conf`, et `50-cloud-init.conf` (déjà présent sur une Debian OVH fraîche, avec `PasswordAuthentication yes`) est inclus *avant* un fichier `99-*`. Un drop-in `99-hardening.conf` serait donc silencieusement ignoré pour cette directive. Vérifier avec `sudo sshd -T | grep -i passwordauth` après toute modif.
- **fail2ban** : `/etc/fail2ban/jail.local` (`bantime=1h`, `maxretry=3` sur le jail `sshd`, backend `systemd` déjà fourni par le paquet Debian).
- **UFW** : OpenSSH + 80/tcp + 443/tcp uniquement. UFW les ouvre à tous, mais **80/443 sont restreints aux plages Cloudflare** par `deploy/caddy/cloudflare-only.sh` (filtre `DOCKER-USER` + `ipset`, UFW étant contourné par les ports Docker), appliqué et installé sur le VPS le 2026-09-30 ; mode d'emploi dans `deploy/caddy/README.md`.
- **Docker** : dépôt officiel (pas celui de Debian), `/etc/docker/daemon.json` avec rotation des logs (`max-size: 10m`, `max-file: 3` — important vu les 40 Go de disque).

### Architecture — 3 stacks Docker Compose indépendants

Un seul VPS pensé pour héberger **plusieurs projets perso** à terme (pas seulement InSeconds) — d'où la séparation infra partagée / apps :

1. **`deploy/infra/`** — Postgres 17 **partagé**, une base + un utilisateur par projet (pas de conteneur DB dédié par projet). Réseau Docker `shared-postgres` (créé ici, `external: true` ailleurs). Aucun port publié sur l'hôte — joignable uniquement depuis les conteneurs du réseau. `init/01-inseconds.sh` crée la base `inseconds` au tout premier démarrage (les scripts `docker-entrypoint-initdb.d/*.sh` ne rejouent jamais sur un volume déjà initialisé — ajouter un futur projet = `CREATE DATABASE`/`CREATE USER` manuel, cf. `deploy/infra/README.md`).
2. **`deploy/caddy/`** — reverse proxy **partagé**, HTTPS automatique, un seul point d'entrée public (80/443) pour tout le VPS. Réseau `caddy-net` (même pattern que `shared-postgres`). Image Caddy **custom** (`Dockerfile`, build `xcaddy` + modules `caddy-dns/cloudflare` + `WeidiDeng/caddy-cloudflare-ip`, cf. piège 34) : le certificat Let's Encrypt est validé par **challenge DNS-01** (Caddy crée un TXT temporaire via l'API Cloudflare) plutôt que HTTP-01 — ça permet de garder le **proxy Cloudflare actif (nuage orange)** sur les domaines, donc l'IP réelle du VPS n'est **jamais exposée publiquement dans le DNS** (`dig`/`nslookup` public ne renvoie que les IP Cloudflare). Nécessite `CF_API_TOKEN` scopé en écriture DNS sur la zone uniquement (pas le token de compte global). Conteneur Caddy tourne en **utilisateur non-root** (`uid 1000`, `CAP_NET_BIND_SERVICE` posée sur le binaire via `setcap` pour bind 80/443 sans root — corrige un finding Sonar "Security Rating", cf. `deploy/caddy/Dockerfile`). Le `Caddyfile` déclare en tête un bloc d'options globales (`servers { trusted_proxies cloudflare {...} }`, cf. piège 34) puis route par domaine (`{$FRONT_DOMAIN}`/`{$API_DOMAIN}`, valeurs réelles dans `deploy/caddy/.env`, non commité) vers `inseconds.front:8080`/`inseconds.api:8080` par nom de conteneur.
3. **`docker-compose.prod.yml`** (projet Compose `inseconds`, conteneurs `inseconds.api`/`inseconds.front` ; le projet s'appelait `inseconds-v2` de la bascule du 16/10/2026 à I2, et `deploy.sh` retire une fois ses conteneurs) à la racine du repo, InSeconds uniquement — juste `api` + `front`, rejoint `shared-postgres` et `caddy-net` en réseaux externes. **Aucun port publié sur l'hôte** (Caddy est l'unique point d'entrée). Variables dans `.env.prod` (non commité, cf. `.env.prod.example`) : `INSECONDS_DB_PASSWORD` (doit être identique à celui de `deploy/infra/.env`), `BREVO_API_KEY`, optionnellement `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS` (export OpenTelemetry vers Grafana Cloud — vides = aucun export), `DATA_PROTECTION_CERTIFICATE_PASSWORD` (certificat `secrets/dataprotection.pfx` du checkout, lisible par l'uid/gid 1654 de l'image ; la bascule s'arrête sans) et `CSP_MODE` (`report-only` par défaut, `enforce` ensuite, #300).

**Ajouter un futur projet** = créer sa base (`deploy/infra`), ajouter un bloc domaine dans `deploy/caddy/Caddyfile` (+ `caddy reload`), et son propre `docker-compose.prod.yml` rejoignant les deux réseaux externes — **aucun redéploiement d'InSeconds n'est déclenché**, chaque stack ne touche que ses propres conteneurs.

### CI/CD

Job `deploy` dans `.github/workflows/ci.yml`, déclenché **uniquement sur push `main`** (pas sur PR ni les autres branches), après succès de toute la suite de tests (`needs: [ci-ok]`, comme `deploy-staging`, G6a #312). Se connecte en SSH au VPS avec une clé **dédiée** (générée sur le VPS, jamais la clé perso — secrets GitHub `VPS_SSH_PRIVATE_KEY`/`VPS_HOST`/`VPS_USER`) et fait `git checkout main && git reset --hard ${{ github.sha }}` (pin sur le commit exact testé par ce run plutôt qu'un `git pull` flottant qui pourrait dériver si un autre push arrive entre-temps) puis appelle **`deploy/vps/deploy.sh`** (commité, cf. piège 43) : `docker-compose.prod.yml`, comme le staging (certificat vérifié, migrations par `--migrate-only` avant de remplacer les conteneurs, test de fumée) avec `BUILD_TIME` (horodatage courant) exporté pour invalider volontairement le cache Docker du build front (cf. piège 25), puis `docker image prune -f` et une vérification santé (`curl` sur `https://api.inseconds.cc/health` + `https://inseconds.cc`, échoue le job si l'un des deux ne répond pas). Ne touche **jamais** `deploy/infra`/`deploy/caddy` (déploiement manuel volontaire — une erreur automatisée dessus impacterait tous les futurs projets, pas seulement InSeconds). **Concurrency dédiée au job `deploy`** (`group: deploy-vps`, `cancel-in-progress: false`, cf. piège 43) — distincte de celle du workflow entier (`${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`, cf. section CI, qui continue d'annuler les runs de tests obsolètes) : un déploiement en cours ne peut plus être interrompu en plein rebuild par un nouveau push, le suivant attend simplement son tour. **Clé d'hôte SSH épinglée** via le secret optionnel `VPS_SSH_HOST_KEY` (à créer manuellement, cf. piège 43 — sans lui, fallback `ssh-keyscan` avec `::warning::` dans les logs).

### Staging (`dev.inseconds.cc` / `api-dev.inseconds.cc`)

Deuxième instance d'InSeconds sur le même VPS, pour tester une branche avant `main` (vrai Deezer, vraie chaîne Cloudflare → Caddy → nginx, test sur téléphone).

- **Déploiement** : push sur la branche **`env/staging`** → suite de tests complète puis job `deploy-staging` de `ci.yml` (attend « CI OK ») (checkout `~/apps/InSeconds-staging`, **séparé** de celui de la prod, puis `deploy/vps/deploy.sh staging`). `env/staging` est protégée (plus de `push -f`) : on y arrive par PR. **Il construit et sert la v2** (`src`) depuis la PR A6. Pour le staging, `deploy.sh` vérifie d'abord le certificat Data Protection (`secrets/dataprotection.pfx` présent sur le VPS, lisible dans le conteneur), applique les migrations (`--migrate-only`, conteneur jetable) **avant** de remplacer les conteneurs (en cas d'échec, la version en place continue de tourner), puis lance le test de fumée `deploy/vps/smoke-test.sh` sur `https://api-dev.inseconds.cc` : routes de test absentes (S9, sondées en GET pour ne jamais rien exécuter), en-têtes de sécurité (S15), `/jobs` protégé (S3). Pas de branche `dev` longue durée. Groupe de concurrency `deploy-vps-staging`, **distinct** de `deploy-vps` (GitHub n'y garde qu'un job en attente et annule le précédent : un groupe commun pourrait faire sauter un déploiement prod en attente).
- **Stack** : `docker-compose.staging.yml` (projet `inseconds-staging`, conteneurs `inseconds-staging.api`/`.front`, images : `src/back/InSeconds.Api/Dockerfile` et `src/front/InSeconds.Client/Dockerfile.prod`), variables dans `.env.staging` (cf. `.env.staging.example`, dont `DATA_PROTECTION_CERTIFICATE_PASSWORD`, obligatoire), base `inseconds_staging` + utilisateur dédié sur le Postgres partagé (création manuelle, cf. `deploy/infra/README.md`). Front construit avec la configuration Angular `staging` (`environment.staging.ts`, arg Docker `BUILD_CONFIGURATION`). Cette configuration pose `environment.name = 'staging'`, qui affiche en haut de toutes les pages un bandeau jaune « DEV — environnement de développement » (`ui/env-banner/`, même rendu que le bandeau des emails) ; les autres builds (`production`, `development`, `e2e`) ne l'affichent pas.
- **`ASPNETCORE_ENVIRONMENT=Staging`** : jamais `Development` ni `Testing` — l'API staging est publique. L'hôte de test n'est de toute façon pas dans l'image (S9), et l' `appsettings.Staging.json` (`src/back/InSeconds.Api/`) pose `Cors:AllowedOrigins` (`https://dev.inseconds.cc` ; les origines de la prod sont déjà dans `appsettings.Production.json`, aucune en dev et en E2E, le front passe par le proxy d'`ng serve`) et, depuis C1, `Jobs:catalogue-refresh:Cron` à « jamais » (même IP que la prod, donc même quota Deezer, piège 16) ; les autres tâches y sont décalées de 30 min sur la prod (cf. § Tâches planifiées).
- **Emails redirigés** : en staging, `RedirectingEmailSender` (`InSeconds.Infrastructure/Email/`, décore `BrevoEmailSender`) envoie **tous** les emails à `EmailRedirect:To` (`STAGING_EMAIL_REDIRECT_TO` dans `.env.staging`, aujourd'hui `clement.rageau+inseconds.staging@gmail.com`), objet inchangé (un préfixe `[DEV]` a été retiré le 2026-09-29 : Gmail regroupe les mails d'objet proche et affichait `[DEV]` sur la conversation contenant aussi les mails de prod), bandeau en tête rappelant l'environnement et le destinataire d'origine. **Obligatoire en Staging** : l'API refuse de démarrer si `EmailRedirect:To` est vide (la base est une copie de la prod, un email ne doit jamais partir vers un vrai joueur). Tests : `EmailStartupTests`.
- **Cloudflare Access** (Zero Trust Free, équipe `curly-night-b396`) protège **uniquement `dev.inseconds.cc`** (policy `Dev`, emails autorisés). Pas `api-dev` : les `fetch` du front ne peuvent pas suivre la redirection de connexion Access. Crawlers bloqués de fait (302 vers Access).
- **Données** : workflow manuel **« Copy prod DB to staging »** (`.github/workflows/staging-db-copy.yml`, `workflow_dispatch`, taper `staging` pour confirmer, à lancer depuis `env/staging` ou `main`) → `deploy/vps/copy-prod-db-to-staging.sh` (envoyé par SSH en `bash -s`, avec `deploy/vps/staging-anonymize.sql` du même commit). Depuis I1 (#235) : API staging arrêtée, `pg_dump` des **schémas v2** de la prod (`players`, `catalogue`, `daily`, `infra` ; jamais `infra.data_protection_keys`, ni `public`, `messaging`, `jobs` : le staging garde les siens), suppression de ces schémas au staging puis restauration, migrations du staging (`--migrate-only`, env/staging peut avoir des migrations d'avance), **anonymisation** (`staging-anonymize.sql` : emails → `player-<id>@example.invalid`, pseudos → `joueur-<12 caractères de l'id>` et `is_admin` retiré sauf `STAGING_KEEP_EMAIL` de `.env.staging`, texte des réponses saisies effacé (verdicts et scores gardés), jetons, appareils, `legacy_tokens`, clés Data Protection et file de Wolverine vidés), clé Data Protection neuve (`--rotate-data-protection-key`). Réglages et statistiques figées viennent de la prod. Avant I1, la copie prenait les tables v1 de `public` et refaisait l'import v1 → v2.
- Connexion SSH des jobs mutualisée dans l'action composite `.github/actions/vps-ssh` (clé de déploiement + clé d'hôte épinglée, cf. piège 43), utilisée par `deploy`, `deploy-staging` et la copie de base.

### Bascule v1 → v2

**Retiré en I1 (#235), la bascule étant faite** : le workflow, `deploy/vps/switch-to-v2.sh` et `deploy/migration-v2/import-to-staging.sh` n'existent plus, ni le reste de l'import `deploy/migration-v2/` (retiré en I2 : historique git). Ce qu'il faisait : workflow manuel **« Bascule v2 »** (`.github/workflows/bascule-v2.yml`, `workflow_dispatch`, `target` = `staging` ou `prod`, confirmation par saisie), qui exécute `deploy/vps/switch-to-v2.sh` sur le VPS : préparation sans arrêt (certificat Data Protection, image, migrations v2), arrêt de l'API actuelle, import des données (`deploy/migration-v2/`), clé Data Protection neuve, historique figé, remplacement des conteneurs par la v2 sous les mêmes noms (`docker-compose.prod-v2.yml`, projet Compose `inseconds-v2` ; Caddy inchangé), santé, puis ouverture (`mark-opened.sql`). Au moindre écart avant l'ouverture, retour arrière : la v1 repart (`docker-compose.prod.yml`), ses tables n'ayant jamais été modifiées. Les anciennes routes de la v1 répondent `410 common.new_version`. `deploy.sh prod` restait en v1 tant que le marqueur `.bascule-v2-done` (racine du checkout, hors git) n'existait pas ; la bascule l'a posé. Le marqueur, la branche v1 de `deploy.sh` et `docker-compose.prod.yml` sont retirés en I2 (le fichier peut être effacé du VPS). Se lance depuis `env/staging` pour la répétition (copie fraîche de la prod, `simulate_failure` pour répéter le retour arrière) et depuis `main` pour la prod, jamais entre 22 h 30 et 1 h UTC. GitHub ne liste un workflow manuel que s'il existe sur la branche par défaut : `main` porte un remplaçant minimal de `bascule-v2.yml` (PR #302), la vraie version vit sur `env/staging` (choisir cette branche dans « Use workflow from » pour la répétition). Répétée avec succès sur le staging le 2026-10-12 (retour arrière simulé + deux passages réels, jalon J5). Détail : `deploy/migration-v2/README.md` § « La bascule » (dans l'historique git), `docs/refonte-v2/DEVELOPPEMENT.md` § G2 et § 9 (actions à faire avant la bascule en prod).

**Faite en prod le 16/10/2026** (run « Bascule v2 » #5, vert à 07:43 UTC, environ 1 min 30). La première tentative s'est arrêtée en préparation, avant l'arrêt de la v1 : `secrets/dataprotection.pfx` n'était pas lisible par l'uid/gid 1654 de l'image (`sudo chgrp 1654 … && sudo chmod 640 …`, cf. `.env.prod.example`) ; la seconde est passée. Reste après la bascule : première nuit (tâches de 23 h, 0 h, 0 h 05 sur healthchecks.io), puis J+1 : vider l'`AuthToken` v1 (`UPDATE "Players" SET "AuthToken" = gen_random_uuid();`). Suivi : #234.

### Sauvegardes de la base

`deploy/infra/backup.sh` sauvegarde la base de prod `inseconds` entière (tous schémas, v1 et v2 ; le staging n'est pas sauvegardé, il se recopie depuis la prod) : `pg_dump -Fc` dans un conteneur `postgres:17-alpine`, vérification (`pg_restore --list`), 7 jours gardés dans `~/backups/postgres/`, puis, si les clés sont dans `deploy/infra/.env`, envoi **chiffré** (rclone crypt, image `rclone/rclone` épinglée) vers le bucket Cloudflare R2 `inseconds-backups` (juridiction EU) : `daily/` gardé 30 jours, première sauvegarde du mois copiée dans `monthly/` gardé 365 jours. Lancé **chaque nuit à 3 h UTC** par le timer systemd du VPS `inseconds-backup.timer` (`deploy/infra/systemd/`, `Persistent=true` : rattrape une nuit ratée au redémarrage ; copié une fois dans `/etc/systemd/system/`, pas par le CI/CD), qui exécute le script du checkout de prod (remis à jour à chaque déploiement), ou à la main (`sudo systemctl start inseconds-backup` / `./backup.sh`). **Surveillance par healthchecks.io** (décision de Clément le 14/10/2026, #315 : Grafana jugé trop pénible à régler, l'ancien log OTLP « Sauvegarde OK » et son alerte Grafana sont retirés) : chaque passage envoie un signal au contrôle `inseconds-backup` (`/fail` en échec) avec `HEALTHCHECKS_PING_KEY` de `.env.prod`, comme les quatre tâches Hangfire de l'API v2 (cf. `src/back/CLAUDE.md` § Tâches planifiées) ; vide = aucun signal. healthchecks.io prévient par email si le signal manque à l'heure prévue ou dès un échec. Sous-commandes : `archive` (même sauvegarde, envoyée dans `archive/` sur R2, **jamais supprimée par la rotation** ; lancée par `deploy/vps/drop-v1-tables.sh prod` avant la suppression des tables v1, I1), `list-remote`, `fetch <daily|monthly|archive>/<nom>` (télécharge et déchiffre depuis R2), `restore-test [fichier]` (restauration complète dans une base jetable `inseconds_restore_test`, supprimée ensuite). **La phrase de passe du chiffrement (`BACKUP_ENCRYPTION_PASSWORD`) est aussi dans le gestionnaire de mots de passe de Clément** : sans elle, les sauvegardes R2 sont illisibles. Mode d'emploi complet : `deploy/infra/README.md` § Sauvegardes. **Volontairement hors de l'API et de Hangfire**, y compris après la bascule v2 (même base `inseconds`, rien à changer) : une sauvegarde doit tourner même quand l'appli est en panne.

### Restaurer un dump PostgreSQL

`pg_dump`/`pg_restore` via un conteneur `postgres:17-alpine` jetable (même version majeure que la prod, évite tout risque d'incompatibilité de format de dump) :

```bash
# Dump depuis une source externe (connection string à adapter)
docker run --rm postgres:17-alpine pg_dump --no-owner --no-privileges -Fc '<connection-string>' > dump.custom

# Restore dans le Postgres partagé du VPS
infra_pw=$(grep '^INSECONDS_DB_PASSWORD=' deploy/infra/.env | cut -d= -f2-)
docker run --rm -i --network shared-postgres -e PGPASSWORD="$infra_pw" postgres:17-alpine \
  pg_restore --no-owner --no-privileges --clean --if-exists -h shared-postgres -p 5432 -U inseconds -d inseconds < dump.custom
```

`--no-owner --no-privileges` évite les erreurs `ALTER OWNER`/`GRANT` si la source utilise un rôle qui n'existe pas côté VPS. Des erreurs sur des extensions de monitoring absentes (`pg_stat_statements`, etc.) sont bénignes — `pg_restore` continue et restaure le reste normalement (`errors ignored on restore: N`, pas un échec).

### Commandes utiles VPS

```bash
# Déployer manuellement (normalement automatique via CI/CD sur push main)
ssh vpsovh "cd ~/apps/InSeconds && git pull --ff-only && chmod +x deploy/vps/deploy.sh && ./deploy/vps/deploy.sh"

# Logs
ssh vpsovh "docker logs inseconds.api --tail 50"
ssh vpsovh "docker logs caddy --tail 50"

# État des 4 conteneurs attendus
ssh vpsovh "docker ps --format 'table {{.Names}}\t{{.Status}}'"
# → shared-postgres, caddy, inseconds.api, inseconds.front

# Recharger Caddy après modif du Caddyfile édité en local puis copié sur le VPS
# (sans coupure) — insuffisant après un git pull/reset --hard, cf. piège 26
ssh vpsovh "docker compose -f deploy/caddy/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile"

# Après un git pull/reset --hard qui touche deploy/caddy/Caddyfile : restart
# (le bind mount du fichier reste sur l'ancien inode sinon, cf. piège 26)
ssh vpsovh "docker restart caddy"

# Promouvoir un compte en admin (players.accounts.is_admin) — cf. piège 5. Précondition : la personne
# s'est déjà connectée au moins une fois via magic link (son compte existe avec cet email).
# Aucune UI/endpoint applicatif pour ça, volontairement — SQL manuel uniquement. Pris en compte en moins
# d'une minute (le rôle est relu en base, cache d'une minute).
infra_pw=$(grep '^INSECONDS_DB_PASSWORD=' deploy/infra/.env | cut -d= -f2-)
docker run --rm --network shared-postgres -e PGPASSWORD="$infra_pw" postgres:17-alpine \
  psql -h shared-postgres -U inseconds -d inseconds \
  -c "UPDATE players.accounts SET is_admin = true WHERE email = 'quelqu-un@example.com';"
# Ancien schéma v1 (avant la bascule du 16/10/2026, inutile maintenant) : UPDATE "Players" SET "IsAdmin" = true WHERE "Email" = '…';
```

## Conventions Git

- **Pas de `Co-Authored-By: Claude` dans les commits**, jamais
- **Author ET committer de CHAQUE commit doivent être l'utilisateur, jamais Claude** — l'identité git par défaut de cet environnement (`user.name`/`user.email`, ex. `Claude <noreply@anthropic.com>`) ne doit **jamais** apparaître dans l'historique, ni comme author ni comme committer, aucune exception. `git commit --author="<nom> <email>"` seul est **insuffisant** : ça ne fixe que l'author, le committer retombe silencieusement sur `user.name`/`user.email` de la config git locale (ne jamais modifier cette config globale, cf. règles de sécurité git). Poser explicitement les deux avant chaque commit, ex. `GIT_AUTHOR_NAME="..." GIT_AUTHOR_EMAIL="..." GIT_COMMITTER_NAME="..." GIT_COMMITTER_EMAIL="..." git commit -m "..."` (variables d'environnement locales à la commande, pas de `git config`). Vérifier après coup avec `git log --format='%an <%ae> | %cn <%ce>' -1`. Si des commits déjà poussés ont un committer incorrect, les corriger (`git filter-branch --env-filter ...` sur la plage concernée, jamais `rebase -i`) puis `git push --force-with-lease` sur la branche de travail (jamais sur `main`).
- Préférer commits atomiques, messages clairs (FR ou EN, peu importe)
- Branche de travail : `feat/<sujet>` (ex: `feat/redis-cache`), jamais de commit direct sur `main` ni `env/staging`. Cible des PR : `env/staging` (déployée sur le staging pour y être testée), puis une PR `env/staging` → `main` pour la prod ; `main` directement seulement pour un correctif urgent de la prod (cf. [État du dépôt](#état-du-dépôt)). Une demande de suivi = un commit de plus sur la même branche

## CI / GitHub Actions

Workflow `.github/workflows/ci.yml`, déclenché sur **push toutes branches + PR vers `main`**, avec `cancel-in-progress` pour annuler les runs obsolètes. Tous les jobs tournent à chaque run (le filtre de chemins qui ne lançait les jobs v2 que sur un changement de `src` est retiré avec la v1 en I2). **Le seul check exigé par le ruleset est « CI OK »**.

**SonarCloud** tourne en *Automatic Analysis* (pas de job dans `ci.yml`). ⚠️ **L'Automatic Analysis de ce projet n'ingère pas `sonar-project.properties`** (testé : sans effet). Les exclusions se posent **dans l'UI SonarCloud** : `Administration → Analysis Scope`, où il y a deux listes distinctes, **Source File Exclusions** (`sonar.exclusions` : fichier ignoré entièrement, ni avertissements ni couverture) et **Duplication Exclusions** (`sonar.cpd.exclusions` : ignoré pour le copier-coller seulement). Vérifier l'état réel : `curl -s "https://sonarcloud.io/api/settings/values?component=Oasis35_InSeconds&keys=sonar.exclusions,sonar.cpd.exclusions"`. Exclusions en place :
- `**/api.generated.ts` (**dans les deux listes** ; jusqu'au 2026-10-05 seulement en Duplication Exclusions, d'où l'avertissement `typescript:S7724` sur le `/* eslint-disable */` de NSwag remonté par le client v2 des joueurs en B5) — le client NSwag généré produit une paire de méthodes request/process au boilerplate quasi identique par endpoint, que la détection de copier-coller comptait comme « duplication sur le nouveau code » à chaque nouvel endpoint (échec Quality Gate, seuil 3 %).
- `**/Email/Templates/**` (Source File Exclusions ; remplace `**/Common/Email/Templates/**` depuis la refonte v2 : couvre aussi `src/back/InSeconds.Api/Modules/Players/Email/Templates/`, mêmes gabarits copiés en B2) — l'HTML des emails transactionnels (`_layout.html` + fragments, cf. `src/back/CLAUDE.md` § Module Players). Sonar y appliquait ses règles HTML *web* (`table` de layout, attributs `bgcolor`/`cellpadding`/`width`/`align` « dépréciés ») → Maintainability B, alors que layout-table + ces attributs sont obligatoires pour un rendu fiable sous Outlook (moteur Word : pas de fl/grid, CSS externe ignoré). Les styles inline répétés d'un template à l'autre gonflaient aussi la duplication. Non pertinent à gater — même logique que `api.generated.ts`.
- `**/v1-schema.sql` (Source File Exclusions, I2) — le schéma de la v1 généré par `dotnet ef migrations script`, figé pour les tests de l'import : Sonar y relevait 7 avertissements PL/SQL (littéraux répétés, comparaison à un booléen, `LIKE`) et ses blocs répétés (une transaction et une ligne d'historique par migration) donnaient 7,7 % de duplication sur le nouveau code. Jamais modifié à la main.
- Ancienne exclusion `src/front/**, src/back/**` (Duplication Exclusions, posée pour la PR A4 : la v2 reprenait beaucoup de code v1) : **retirée de l'UI le 16/10/2026** avec la suppression de la v1 (I2, #236).

Le fichier `sonar-project.properties` racine est conservé uniquement comme documentation d'intention (et serait honoré si on passait un jour à une analyse par scanner en CI).

**Doublon connu (non corrigé, volontairement)** : sur une branche avec PR ouverte, chaque push déclenche deux runs pour le même commit (`push` sur `refs/heads/<branch>` et `pull_request` sur `refs/pull/<n>/merge` — deux groupes de concurrence différents car basés sur `github.ref`). Le fix naturel (`github.head_ref || github.ref` dans `concurrency.group`) fait échouer la Quality Gate SonarCloud (`C Security Rating on New Code`) : `github.head_ref` est le nom de branche fourni par l'auteur de la PR (contrôlable depuis un fork), que Sonar traite comme entrée non fiable dès qu'il apparaît dans un workflow — même utilisé sans risque réel ici (simple identifiant de groupe, jamais interprété en shell). Tenté et reverté le 2026-07-23. Solution propre restant à évaluer : restreindre le trigger `push` à `main` uniquement (`push.branches: [main]`) et laisser `pull_request` couvrir les branches de feature — supprime le doublon sans toucher à la concurrency, mais change le moment où la CI remonte un premier retour (plus de run tant qu'aucune PR n'est ouverte).

**Jobs** :
- **Job `back`** (`src/back`) : build Release, `dotnet ef migrations has-pending-model-changes` (échoue si une entité ou une configuration change sans migration), code Wolverine généré à jour (supprime `Internal/Generated`, relance `codegen write`, compare au dépôt), `dotnet test --solution InSeconds.slnx` (unitaires, architecture, intégration Testcontainers, import), puis construction de l'image de prod et contrôle qu'elle ne contient pas l'hôte de test.
- **Job `front`** (`src/front/InSeconds.Client`) : `npm ci`, `npm run lint:arch` (Sheriff + couche `domain/` pure), build de prod (service worker compris), Vitest dans Chromium (`--autoplay-policy=no-user-gesture-required`, sans quoi Chromium refuse de jouer un son et les tests du lecteur ne vérifient rien).
- **Job `e2e`** : Playwright contre l'hôte de test (`InSeconds.Api.Testing`, port 5175, `--no-launch-profile`, service PostgreSQL) et `ng serve --configuration e2e-ci` (5176). Rapport HTML toujours publié en artefact.
- **Job `nginx-headers`** : construit et sert l'image nginx du front, vérifie `Cache-Control` (bundles immuables, `no-cache` pour l'index, les traductions et les fichiers du service worker), les en-têtes de sécurité, la CSP et le `Content-Type` de `robots.txt`/`sitemap.xml` (`scripts/check-nginx-headers.sh`). Seul job à tester la config nginx (piège 20).
- **Job `CI OK`** (`ci-ok`, `if: always()`) : agrège tous les jobs, échoue si l'un a échoué ou a été annulé. **Tout nouveau job doit être ajouté à ses `needs`.**
- **Job `deploy-staging`** (push sur `env/staging`, attend « CI OK ») et **job `deploy`** (push sur `main`, attend aussi « CI OK » depuis G6a, #312 : après la bascule il déploie la v2, qui doit passer ses tests) : cf. [Déploiement VPS](#déploiement-vps).

Hors `ci.yml` : workflow manuel **« Copy prod DB to staging »** (`staging-db-copy.yml`) ; « Bascule v2 » (`bascule-v2.yml`) est retiré en I1 (#235), cf. « Bascule v1 → v2 ». La sauvegarde de la base ne passe pas par GitHub Actions (timer systemd du VPS, cf. « Sauvegardes de la base »).

Runners Ubuntu, jobs en parallèle (les E2E après les builds). Setup .NET via `global-json-file` (`src/back/global.json`) pour respecter le pin SDK.

### Règles importantes pour la CI

- **Toujours générer la migration EF** après une modif d'entité ou de configuration, et **régénérer le code Wolverine** après une modif de handler ou d'endpoint, sinon le job `back` casse
- **Ne pas committer si le build front prod échoue** localement (`npm run build` doit passer), ni si `npm run lint:arch` échoue
- **Tests E2E** : contre l'hôte de test (faux Deezer, faux email, `/api/e2e/reset`/`reseed`/`login-as-admin`…, cf. `src/back/CLAUDE.md` § Hôte de test). 
- **Tests d'intégration** : Testcontainers (Docker fourni par `ubuntu-latest`), pas de `services:` YAML nécessaire.
- Si un job casse sur du formatage / lint (futur `dotnet format` ou `ng lint`), corriger en local avant de re-pusher — ne pas désactiver le check
- Repo sur `Oasis35/InSeconds` (GitHub). Tier gratuit : 2000 min/mois si privé, illimité si public

### Dependabot (`.github/dependabot.yml`)

**Cible `env/staging`** pour nuget et npm (testé au staging avant `main`, comme toute PR), `main` pour les actions GitHub (pas de `target-branch`). Plus de branche d'intégration séparée `feat/dependabot` (retirée le 2026-09-08 : une étape manuelle en plus sans bénéfice).

**Groupes par risque, pas un seul `-all` fourre-tout** — l'ancien setup groupait tout npm (ou tout nuget) dans une seule PR mensuelle, ce qui a cassé `npm ci` une fois : le bump groupé npm-all a embarqué `typescript` 7 et `jasmine-core` 7, tous deux au-delà de ce que le reste de la toolchain supportait (peer dep `@angular/build` sur TypeScript, API dépréciées retirées côté Jasmine/Karma), nécessitant un repin manuel après coup (cf. commit `bea8548`, PR #119). Setup actuel :
- **npm** : groupe `angular` (tous les `@angular/*`, minor+patch uniquement) — ces paquets ont des peer deps strictement alignées entre eux (cf. piège 15 racine), donc toujours groupés pour ne jamais bumper partiellement. Groupe `npm-minor-patch` pour le reste (minor+patch). **Les majeures ne sont jamais groupées** (ni Angular ni le reste) — chacune part dans sa propre PR, review individuelle obligatoire (c'est précisément une majeure isolée — `typescript`/`jasmine-core` — qui avait cassé la CI la dernière fois).
- **nuget** : même logique (`nuget-minor-patch` groupé, majeures individuelles). `directory` pointe sur le dossier de la solution (pas la racine du repo, où il n'y a aucun `.csproj`/`.sln*` : Dependabot n'y trouvait aucune dépendance NuGet, M18 de la revue du 2026-09-25).
- **github-actions** : ajouté (pas groupé, peu de mises à jour attendues) — tient à jour les versions des actions (`actions/checkout`, etc.), complète le durcissement CI du piège Sonar `S8543`/`S6505` (versions non épinglées, cf. plus haut).

**Entrées actuelles** : `nuget` (`src/back`) et `npm` (`src/front/InSeconds.Client`), `target-branch: env/staging`, étiquette `dependencies`, groupes `nuget-minor-patch`, `angular` (avec `@ngrx/signals`) et `npm-minor-patch` (renommés sans « v2 » en I2).

**Reste mensuel** (l'hebdomadaire a été essayé puis abandonné le jour même — trop de bruit) + `open-pull-requests-limit: 5` (au lieu de 2) — juste assez pour que les groupes minor/patch et une éventuelle majeure isolée coexistent le même mois sans se bloquer mutuellement.

## Conventions .NET

- **Solutions au format `.slnx`** (jamais `.sln` classique). Créer avec `dotnet new sln --format slnx`
- **`global.json` avec `rollForward: latestFeature`** pour accepter tout SDK 10.0.x ; il fixe aussi le lanceur de tests Microsoft.Testing.Platform (`dotnet test --solution …`)
- Versions des paquets centralisées dans `Directory.Packages.props`, avertissements traités en erreurs (`Directory.Build.props`)
- Cibler `net10.0`, nullable + implicit usings activés

## Pièges connus

Les numéros sont stables : le code, les tests et les autres CLAUDE.md y font référence. Un piège que la v2 a fait disparaître garde sa ligne, marquée **Retiré**, avec la raison. Le récit complet de chaque incident (dates, symptômes, correctif v1) est dans l'historique : `git show b38825d:CLAUDE.md`. Un piège qui concerne le code garde **un test nommé** (règle de la refonte).

1. **Retiré (v2)** — helper Visual Studio dans le conteneur de l'ancienne API : la v2 ne tourne pas dans le compose de dev.
2. **Healthcheck PostgreSQL** — `pg_isready` dans le conteneur (`docker-compose.yml`, `deploy/infra`).
3. **Retiré (v2)** — le polling de fichiers pour le hot-reload dans le conteneur Windows ne concerne que l'API v1 dans `docker-compose.yml`.
4. **Retiré (v2)** — CORS à mettre à jour quand le port du front change : en dev et en E2E, le front v2 passe par le proxy d'`ng serve` (même origine, aucune origine CORS). Les origines de confiance des fronts locaux sont dans `Auth:TrustedOrigins` de l'hôte de test (piège 22).
5. **Admin = rôle sur le compte, pas un mécanisme séparé** — un admin se connecte comme un joueur (lien magique). Le rôle est `players.accounts.is_admin`, posé **uniquement en SQL manuel** (cf. [Commandes utiles VPS](#commandes-utiles-vps)), jamais par le code. Il n'est pas écrit dans le cookie : `DeviceSessionValidator` le relit en base (cache d'une minute), la policy `Admin` protège tout `/api/admin*` et `/jobs`. Tests : `Security/SecurityTests` (401/403 de toutes les routes admin).
6. **Retiré (v2)** — `Results.Forbid()` sans `AddAuthentication()` : la v2 enregistre l'authentification (cookie standard) et renvoie 401/403 sans redirection (`PlayerCookieEvents`).
7. **Cookie et same-site** — front et API sont same-site (`inseconds.cc` / `api.inseconds.cc`) : cookie `__Host-inseconds` en `SameSite=Lax; Secure; HttpOnly` en prod et staging, `inseconds` en `SameSite=Strict` sans `Secure` en dev et test (`AuthSetup`). Ne jamais repasser en `SameSite=None` (piège 23).
8. **Réglages lus en base au démarrage** — `DatabaseSettingsConfigurationProvider` n'ignore que « base, schéma ou table absents » (premier démarrage avant migration) ; toute autre erreur SQL empêche le démarrage (la v1 avalait toutes les erreurs). Les réglages sont rechargés juste après les migrations.
9. **E2E : `launchSettings.json` écrase l'environnement** — `dotnet run` sans `--no-launch-profile` impose `Development`. Toujours `--no-launch-profile` pour lancer l'hôte de test en `Testing` (`playwright.config.ts`, job CI `e2e`).
10. **E2E : ports** — hôte de test et front sur **5175/5176 en CI** (`ng serve --configuration e2e-ci`), **5177/5178 en local** (`--configuration e2e`). Ne pas confondre les deux ; l'extrait du faux Deezer pointe sur le front de test (`E2E_FRONT_PORT`).
11. **Tests d'intégration : Docker requis** — Testcontainers (`postgres:17-alpine`), un seul conteneur pour la suite, une base neuve par classe. xUnit v3 : `IAsyncLifetime.DisposeAsync()` rend un `ValueTask`. Avec le SDK .NET 10, lancer `dotnet test --solution InSeconds.slnx` (lanceur Microsoft.Testing.Platform, `global.json`). `ApiFactory.DisposeAsync` vide les pools Npgsql, sinon la suite atteint la limite de connexions du serveur.
12. **Retiré (v2)** — cookie réutilisé d'un test à l'autre : la v2 donne une base neuve à chaque classe de tests, et `TestAuthHandler` simule un joueur par en-têtes quand le vrai cookie n'est pas l'objet du test.
13. **Jamais de `catch {}` nu côté Deezer** — `OperationCanceledException` n'est relancée que si l'annulation vient de l'appelant (un délai d'attente interne du `HttpClient` est un échec de Deezer, `Unavailable`), le reste est journalisé en `Warning` (`DeezerLog`). Tests : `UnitTests/Deezer/DeezerClientTests`.
14. **URL d'extrait Deezer signées et expirées** — l'URL porte `?hdnea=exp=…` : passé ce délai, le CDN répond 403. `CachedPreviewProvider` borne le cache par `exp` moins 1 h de marge (pas de cache s'il reste moins d'1 h). Côté front, l'élément audio lit l'extrait en flux : une signature expirée en cours de route donne une erreur de lecture, et « Réessayer » redemande une adresse fraîche (`refreshPreviewUrl`). Tests : `UnitTests/Deezer/DeezerCacheTests`.
15. **Bumps Angular partiels = `npm ci` cassé** — les `@angular/*` (y compris `cli`, `compiler-cli`, `build`) exigent la même version exacte, `@ngrx/signals` suit ; Dependabot les groupe (`angular`, `angular-v2`). Toujours tout aligner dans la même PR.
16. **Erreurs Deezer en HTTP 200** — quota (4), service occupé (700), morceau supprimé (800) arrivent en `200 OK` avec `{"error":…}`, hors de la résilience HTTP. Seul **800** est une réponse déterminée (`Missing` / `NotFound`) ; tout le reste donne `Unavailable`, qui **ne change jamais** `preview_status` (`Track.RecordPreviewCheck`). `catalogue-refresh` espace ses lots (10 morceaux / 1,5 s) et ne tourne pas en staging (même IP que la prod, même quota). Tests : `DeezerClientTests`, `UnitTests/Catalogue/TrackTests`, `RefreshPreviewsTests`, `Jobs/ScheduledJobsTests`.
17. **Clés Data Protection : en base, chiffrées par certificat** — sans clés persistées, chaque redéploiement rendait les cookies illisibles (tous les joueurs perdaient leur identité). v2 : `infra.data_protection_keys`, chiffrées par le certificat `secrets/dataprotection.pfx` (exigé en prod et staging, `DataProtectionSetup`) ; une clé neuve est créée après chaque import (`--rotate-data-protection-key`, sinon la clé v1 en clair chiffrerait les nouveaux cookies). Tests : `Security/DataProtectionTests`.
18. **Série : toujours comparer sur la date du défi, jamais sur l'heure de complétion** — terminer le défi de la veille après minuit ne casse pas la série ; les jours manqués se comptent sur les dates des défis. `DailyStreak.RecordCompletion(date du défi, …)`. Corollaire : la veille reste jouable après minuit, ses stats ne sont figées qu'à J-2 (`daily-close-day`), et une partie d'un défi plus vieux que la veille est refusée (409 `daily.abandoned`). Tests : `Daily/StreakTests`, `PlaySessionTests`, `DayStatsSnapshotTests`.
19. **Retiré (v2)** — `Task.Delay(~24 h)` qui se réveillait avant minuit et sautait un jour : les tâches de nuit passent par Hangfire, qui planifie sur l'horloge murale.
20. **`Cache-Control` nginx** — bundles hashés en `public, max-age=31536000, immutable`, tout le reste (`index.html`, `i18n/*.json`, fichiers du service worker, `manifest.webmanifest`) en `no-cache` ; sinon un navigateur garde de vieilles traductions après un déploiement. nginx n'hérite pas des `add_header` du niveau `server` dans une `location` qui a les siens : les en-têtes de sécurité sont inclus dans chaque `location` (`security-headers.conf`). Vérifié par le job CI `nginx-headers`, seul à servir l'image de prod.
21. **Scanners de liens dans les emails** — Safe Links et certains antivirus ouvrent les liens d'un email avant l'humain. Le lien magique et le lien de changement d'email ne se consomment **jamais** à l'ouverture de la page, seulement au clic sur « Confirmer ». Tests : `Players/MagicLinkTests`, specs `verify` / `confirm-email` du front.
22. **Origine de confiance sur la vérification du lien magique** — seul `POST` public qui pose un cookie à partir d'un secret : `TrustedOrigins` exige `Origin` (ou l'autorité exacte du `Referer`) dans `Cors:AllowedOrigins` + `Auth:TrustedOrigins`. Un port de front oublié dans `Auth:TrustedOrigins` de l'hôte de test casse silencieusement les E2E sur ce port. Ne s'applique pas à la confirmation d'un changement d'email (aucun cookie posé) ni aux routes admin. Tests : `MagicLinkTests`, `UnitTests/Players/TrustedOriginsTests`.
23. **Jamais `SameSite=None` sur le cookie** — les navigateurs (Safari ITP surtout) purgent ces cookies bien avant leur durée nominale : déconnexions quasi quotidiennes en 2026-09. `Lax` suffit, rien n'étant cross-site (cf. piège 7, `AuthSetup`).
24. **Mémoire : Workstation GC et caches dédiés** — Server GC (défaut du SDK Web) retient la mémoire dans un conteneur contraint : `ServerGarbageCollection=false` et `ConcurrentGarbageCollection=false` dans `InSeconds.Api.csproj`. Tout `MemoryCache` avec `SizeLimit` exige une `Size` sur chaque `Set` (exception sinon) ; la v2 utilise des caches dédiés (`DeezerCache`, `DeviceSessionStatusCache`), jamais l'`IMemoryCache` partagé. Tests : `DeezerCacheTests`.
25. **Cache Docker et horodatage du build** — une commande non déterministe dans un `RUN` n'est pas rejouée si les couches d'avant n'ont pas changé : l'heure de déploiement de l'admin restait figée. `deploy.sh` exporte `BUILD_TIME` à chaque déploiement, passé en argument de build au front (`ng build --define BUILD_TIME`), ce qui invalide la couche.
26. **`caddy reload` ne suffit pas après un `git reset --hard` sur le Caddyfile** — le fichier est monté seul en bind mount, lié à l'inode d'origine ; git remplace le fichier (nouvel inode) et Caddy relit l'ancien (`config is unchanged`). Faire `docker restart caddy` (certificats conservés dans leurs volumes).
27. **`X-Forwarded-For` derrière Cloudflare puis Caddy** — deux sauts à dérouler, sinon le rate limiting compte l'IP d'un edge Cloudflare (des milliers de visiteurs dans le même compartiment). `TrustedProxyNetworks` (`InSeconds.Infrastructure/Networking`) fait confiance aux plages privées (Caddy) et aux plages Cloudflare, avec `ForwardLimit = null` ; une IP hors de ces plages arrête le déroulement (pas d'usurpation). Tests : `Security/ForwardedHeadersAndRateLimitingTests`.
28. **Filtre texte sur plusieurs champs** — une recherche « Artiste Titre » ne correspond à aucun des deux champs pris seul : le filtre du pool admin teste aussi `artist + ' ' + title` (`admin/domain/pool-filters.ts`). Vaut pour tout futur filtre multi-champs.
29. **État `[LoggerMessage]` recyclé après l'appel** — un logger de test qui garde la référence de `state` la voit vidée : copier les propriétés au moment de l'appel (`UnitTests/Support/CapturingLogger`).
30. **Lien magique ouvert dans un navigateur déjà connecté** — un compte déjà lié n'est **jamais** converti : l'adresse sans compte obtient un nouveau joueur, le compte d'origine reste intact (sinon un tiers récupérait le compte d'une victime). `AccountSignIn` ; le front prévient avant de confirmer. Tests : `Players/MagicLinkTests`.
31. **Rien qui identifie un morceau avant la réponse** — ni artiste, ni titre, ni année, ni identifiant Deezer dans `POST /api/daily/sessions` ; `GET /api/daily/stats/today` ne remplit `tracks` que pour un joueur dont la partie est finie. Pochette et lien Deezer n'arrivent qu'avec la réponse. Tests : `Daily/TodayStatsTests`, `StartSessionTests`, E2E `answers-hidden.spec.ts`.
32. **Réponse perdue sur coupure réseau** — `DailyApi.submitAnswer` réessaie 2 fois une coupure ou un 5xx (jamais un 4xx) ; un échec définitif remet la manche en « Réessayer » sans rien enregistrer ni afficher de faux résultat. Sinon la partie restait en cours et finissait expirée.
33. **Échec de lecture = état `error`, jamais `idle`** — un retour à `idle` relançait l'écoute automatique en boucle (round bloqué, requêtes en rafale vers le CDN). L'`AudioPort` passe en `error`, la manche montre « Réessayer / Passer ». Tests : `round-player.component.spec.ts`, E2E `audio-error.spec.ts`.
34. **`trusted_proxies` dans le Caddyfile** — sans lui, Caddy remplace `X-Forwarded-For` par l'IP du edge Cloudflare. Bloc global `servers { trusted_proxies cloudflare {…} }`, module `caddy-cloudflare-ip` dans l'image Caddy (`deploy/caddy/Dockerfile`). Rebuild manuel de Caddy (jamais par la CI).
35. **Verrou du morceau en cours et plancher d'écoute** — le morceau en cours est le premier sans réponse ; un autre morceau ne prend pas le verrou (409 `daily.track_lock_not_released`), sinon on contournait la pénalité d'indice ou le plancher. `TrackRound.Listen` garde le maximum écouté, `Answer` refuse un palier annoncé sous ce plancher (400 `daily.listened_duration_below_verified_minimum`), le niveau d'indice vient de la session, jamais du client. Tests : `Daily/PlaySessionTests`, `UnitTests/Gameplay`.
36. **Jamais le texte d'une recherche dans les journaux** — seulement sa longueur (`DeezerLog`, `QueryLength`). Le tag `url.query` du span serveur est absent ou masqué. Tests : `Catalogue/SearchTelemetryTests`, `DeezerClientTests`.
37. **Une erreur de base ne déconnecte jamais** — si la validation de l'appareil (`DeviceSessionValidator`) ou la transition des cookies v1 n'arrivent pas à lire la base, la requête échoue en 500 ; seul un cookie réellement invalide ou révoqué est rejeté (la v1 créait un nouvel invité sur une panne passagère). Tests : `Players/CookieValidationTests`, `LegacyCookieTests`.
38. **Fin de partie sur le nombre réel de morceaux du défi** — jamais sur le réglage `TracksPerChallenge`, qui peut avoir changé depuis la génération (`DailySession.Answer`). Tests : `Daily/PlaySessionTests`.
39. **Déconnexion = cet appareil seulement** — `POST /api/players/auth/logout` révoque la session d'appareil courante, les autres appareils restent connectés ; « déconnecter les autres appareils » est une action à part (et supprime aussi le jeton v1 du joueur). En v1, tous les appareils partageaient un jeton et le faire tourner déconnectait tout le monde (incident du 2026-09-30). Tests : `Players/DevicesTests`.
40. **« Écouter plus » et relecture** — « écouter plus » pendant la lecture repousse l'arrêt sans couper ; à l'arrêt, il relit depuis 0 jusqu'au nouveau palier ; la relecture (↺) ne remet pas `wasExtended` à faux. `HtmlAudioPort`, tests `html-audio.port.spec.ts` (vrais sons dans Chromium, lancé avec `--autoplay-policy=no-user-gesture-required`).
41. **Statistiques du jour en échec** — un échec de `stats/today` met les stats à `null` et l'écran s'affiche sans, sans remonter l'erreur deux fois (`DailyGameStore`).
42. **Réponse Deezer tardive dans l'admin** — fermer la fenêtre d'écoute du pool arrête le son, et une recherche arrivée après la fermeture (ou après l'ouverture d'un autre morceau) ne relance rien. Tests : `preview-track.dialog.spec.ts`.
43. **Déploiement par la CI** — clé d'hôte SSH épinglée (secret `VPS_SSH_HOST_KEY`, sinon `ssh-keyscan` avec avertissement), `docker image prune -f` (jamais `-a` : d'autres projets partagent le VPS), groupe de concurrency propre au déploiement (`cancel-in-progress: false`, un déploiement n'est jamais coupé en plein rebuild), vérification de santé après déploiement. Tout est dans `deploy/vps/deploy.sh` et l'action `.github/actions/vps-ssh`. Piste non appliquée : restreindre la clé de déploiement par `command=` dans `authorized_keys`.
44. **Arrêt du palier calé sur le son réel** — un chrono lancé à l'appel de `play()` coupait le son trop tôt sur mobile (le son sort parfois plusieurs centaines de millisecondes plus tard) : le chrono part à l'événement `playing` pour `palier − currentTime`, il est suspendu sur `waiting`, et une boucle `requestAnimationFrame` coupe dès que `currentTime` atteint le palier (`HtmlAudioPort`, tests `html-audio.port.spec.ts`). Rétabli en v2 avec le lecteur de la v1 (#309, la v2 avait d'abord Howler). Autre règle : **l'écoute automatique n'a lieu qu'une fois par morceau** (`autoStarted`, `gameplay/domain/track-round.ts`), sinon un retour au repos ramenait le joueur au premier palier.
45. **Copie presse-papier intermittente** — `navigator.clipboard.writeText` peut rejeter même dans un vrai clic (« Document is not focused ») : repli sur une copie par textarea + `execCommand('copy')`, rejet remonté sans jamais le texte copié (`core/clipboard/ClipboardService`). E2E `share-button.spec.ts`.
46. **Faux événement `playing` de Safari** — sur iPhone, `playing` part dès l'appel à `play()` alors que le son ne démarre que bien plus tard (relecture ↺ surtout) : un chrono fixe coupait le palier avant presque tout son. Le chrono ne coupe jamais à l'aveugle : à l'échéance, il relit `currentTime` et se reprogramme si le palier n'est pas atteint, et rien ne coupe pendant un `seeking` (Safari renvoie l'ancienne position juste après `currentTime = 0`). `HtmlAudioPort`, tests `html-audio.port.spec.ts` (démarrage lent, faux `playing`). Rétabli en v2 avec #309.
47. **Conditions de l'API Deezer** — usage **strictement non commercial** (ni revenu, ni publicité, ni partenaire), extraits de 30 s seulement, **aucun audio ni aucune image Deezer stockés** (ni dans un cache persistant du navigateur, service worker compris : `ngsw-config.json` n'a aucun `dataGroups`, ni dans une image générée comme les stories) ; seules les métadonnées artiste/titre et le hash de pochette sont gardés. La page `/privacy` mentionne l'usage privé et les CDN Deezer qui voient l'IP du joueur. Synthèse : `audit/conditions-api-deezer-2026-10-02.md` (dossier partagé du projet).

## Ce que fait l'application

Vue fonctionnelle ; le détail technique de chaque point est dans `src/back/CLAUDE.md` et `src/front/CLAUDE.md`, les règles du jeu dans [`docs/GAMEPLAY_RULES_FR.md`](docs/GAMEPLAY_RULES_FR.md).

- **Jeu du jour** (`/daily`) : accueil, reprise d'une partie en cours, manche (écoute par paliers, « écouter plus », indices année puis artiste masqué, autocomplétion Deezer, « Passer (0 pts) »), révélation avec l'histogramme « en combien de temps les autres ont trouvé », récap final, écran « déjà joué » avec compte à rebours, égaliseur de la répartition des scores du jour, partage du score (emoji, presse-papier). Le son ne démarre que sur un clic (iPhone). Confirmation avant de quitter une partie en cours, synchronisation entre onglets.
- **Identité** : invité créé au premier « Commencer » (la lecture de l'état du jour ne crée rien) ; compte optionnel par lien magique (inscription ouverte, pas de mot de passe), pseudo, changement d'email confirmé à la nouvelle adresse, liste des appareils connectés, déconnexion d'un appareil ou de tous les autres. Les cookies v1 sont repris à la première visite (une session d'appareil par conversion).
- **Série et gels** : série sur la date du défi, gels pour les comptes (1 offert à la création, +1 tous les 7 jours, 2 au plus), série protégée ou perdue, gélule et panneau de détail, toasts de fin de partie.
- **Admin** (`/admin`, rôle `is_admin`) : tableau de bord, défis (stats par défi, chips joueur « toi », histogrammes, recalcul d'une photo figée), pool (recherche et ajout Deezer, écoute, renommage à tout moment, désactivation, suppression d'un morceau jamais utilisé, autonomie du pool), joueurs (comptes, série, historique de 30 jours), actions (témoins des tâches planifiées, cooldown, stories Instagram hebdomadaires), lien vers `/jobs`, heure de déploiement.
- **Transverse** : FR/EN (détection puis choix dans le pied de page), PWA installable, nouvelle version appliquée d'elle-même à un moment sûr (jamais pendant une manche, une saisie ou une fenêtre ouverte ; bandeau « Nouvelle version disponible » seulement en secours), overlay « Service indisponible » (sonde `/health`), code d'erreur affiché au joueur (le `traceId`), page `/privacy`, avis « l'adresse a changé » pour l'ancienne URL `code.run`, CSP du front (en `report-only` jusqu'à une semaine sans violation en prod, puis bloquante : #300).
- **Observabilité** : OpenTelemetry (logs, traces, métriques) exporté en OTLP vers Grafana Cloud si `OTEL_EXPORTER_OTLP_ENDPOINT` est défini ; tag `inseconds.player_id` et scope `PlayerId` sur chaque requête identifiée, pour suivre le parcours d'un joueur. **Jamais d'email, de pseudo, de réponse saisie, de cookie ni d'`Authorization` dans la télémétrie** (testé). Logs SQL d'EF Core coupés en prod et staging (`Database.Command` en `Warning`) ; une écriture refusée par la base est journalisée en `Warning`, la panne réelle en `Error` par le gestionnaire global. Une erreur remontée par le front porte la version du front, l'état de la connexion et l'appareil (« Safari · iPhone », jamais le `User-Agent` brut).
- **Ancienne API** : les routes de la v1 ont répondu `410 common.new_version` après la bascule ; retirées en I1 (#235), elles répondent 404.

## À venir

- **Après la bascule du 16/10/2026** (phase H, #234 : reste la première nuit et le J+1, vider l'`AuthToken` v1) : le nettoyage (I1, #235 : routes en 410 retirées et copie prod → staging des schémas v2 par la PR I1, puis suppression des tables v1 à lancer à la main sur le staging puis en prod, `deploy/vps/drop-v1-tables.sh` ; I2 : code v1, jobs CI v1, `src/v2` → `src`, scripts d'import, exclusion de duplication Sonar ; I3 : `legacy_tokens` et middleware de transition). Détail : `docs/refonte-v2/DEVELOPPEMENT.md` § 9.
- **CSP bloquante** après la mise en prod (#300).
- **Mode Runs** (après la v2) : l'architecture lui réserve un module et un domaine, rien n'est créé avant.
- Le reste : [`docs/TACHES.md`](docs/TACHES.md).

## Décisions d'architecture notables

- **Pas de leaderboard permanent** — stats globales seulement ; les comptes servent à garder série et historique, le jeu reste 100 % jouable en invité.
- **Pas de mot de passe** — lien magique uniquement. La logique « trouver le compte par l'email, sinon le créer sur l'invité du navigateur » (`AccountSignIn`) est indépendante du moyen de vérification : un futur Google OAuth n'aura qu'à l'appeler.
- **Monolithe modulaire, pas de microservices** — une API, une base, des modules séparés par leurs contrats, vérifiés par les tests d'architecture.
- **Wolverine** pour les endpoints, les transactions et l'outbox (PostgreSQL, pas de RabbitMQ) ; **Hangfire** pour les tâches planifiées (tableau de bord `/jobs`).
- **Stats d'un jour terminé figées** (J-2), recalculables à la main ; la veille et le jour même en direct.
- **Bibliothèques éprouvées plutôt que du code maison** (NgRx SignalStore, CDK Dialog, Hangfire…), même si l'architecture doit s'y adapter. Exception assumée : le son, sur un simple élément audio (Howler essayé en v2 puis retiré après la recette sur iPhone, #309).
- **Autocomplétion Deezer par l'API** (`GET /api/catalogue/search`) : l'API Deezer refuse les appels CORS du navigateur.

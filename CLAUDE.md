# CLAUDE.md - InSeconds

InSeconds est un blind test musical quotidien. Chaque jour (jour UTC), tout le monde a le même défi de N morceaux (`Daily:TracksPerChallenge`, 5). La lecture démarre au palier le plus court (0,5 s), et le joueur peut prolonger l'écoute avant de proposer artiste et titre : moins il a écouté, plus il marque. On joue en invité, le compte est optionnel (lien magique). Un second mode, **Survie** (« Runs » dans le code), est ouvert sur invitation. Prod : `https://inseconds.cc` (API `https://api.inseconds.cc`). Staging : `https://dev.inseconds.cc`. La page de rebond GitHub Pages (`oasis35.github.io/InSeconds`) a été retirée : ne pas la recréer.

## Où est le savoir

| Où | Quoi | Chargé |
|---|---|---|
| ce fichier | ce qui sert à toute tâche : règles dures, conventions, index des pièges | toujours |
| [`src/back/CLAUDE.md`](src/back/CLAUDE.md), [`src/front/CLAUDE.md`](src/front/CLAUDE.md) | commandes, structure, recettes, conventions de test de chaque côté | dès qu'on lit un fichier du dossier |
| `.claude/rules/**/*.md` | le savoir d'un module, d'un domaine ou du déploiement (invariants, pièges, où regarder), avec leurs `paths` | seulement quand on lit un fichier qui correspond |
| [`docs/`](docs/README.md) | règles du jeu, Survie, exploitation, conformité, décisions | à la demande |

Une règle vit à un seul endroit : ailleurs, on y renvoie. Ces fichiers décrivent le code tel qu'il est, sans historique (git le garde ; `docs/historique/` résume les grands chantiers). Une PR qui change une règle ou un piège met à jour le fichier qui le porte.

## Stack

.NET 10, Wolverine, EF Core, PostgreSQL 17, Hangfire (monolithe modulaire) ; Angular 22 zoneless, NgRx SignalStore, Tailwind v4, élément `Audio` HTML, PWA. Hébergé sur un VPS OVH (Debian 13), conteneurs Docker derrière Caddy et Cloudflare.

## Branches et PR

- Branche de travail `feat/<sujet>` depuis `env/staging`. PR vers `env/staging` (déployée au staging pour y être testée), puis PR `env/staging` → `main` pour la prod, **en merge commit, jamais en squash** (le squash crée des conflits au merge suivant). Un correctif urgent peut viser `main`, puis `main` est remergée dans `env/staging`.
- `main` et `env/staging` sont protégées (PR obligatoire, pas de force-push, check « CI OK » exigé). Jamais de commit direct dessus.
- Un fil démarre sur un brief court ([`.github/ISSUE_TEMPLATE/brief.md`](.github/ISSUE_TEMPLATE/brief.md)) ; un champ vide prend sa valeur par défaut : PR brouillon vers `env/staging`, `relecteur-pr` avant « prêt ». Une nouveauté ou un écran reste sans code tant que Clément n'a pas donné son « go ». Une PR ne fait que son brief ; une demande de suivi est un commit de plus sur la même branche.

## Ports (non standards)

| Service | Port |
|---|---|
| API (`dotnet run`, hôte de test compris) | **5175** |
| Front (`ng serve`) | **5176** |
| E2E en local : API de test / front | **5177** / **5178** (5175 / 5176 en CI) |
| PostgreSQL | **5432** |

Tous les ports en `51xx` (4200 est pris par d'autres projets). Avant d'en changer un : `git grep -n '517[5-8]'` et tout propager.

## Structure

```
.claude/        hooks, sous-agents, skills, règles par chemin (rules/)
.github/        workflows (ci.yml, staging-db-copy.yml), actions (stop-run, vps-ssh), modèle de brief, dependabot
deploy/         infra (Postgres partagé, sauvegardes), caddy, grafana (tableaux JSON), vps (deploy.sh, smoke-test.sh, copie prod → staging)
docs/           sommaire dans docs/README.md
src/back/       InSeconds.slnx : Api (modules), Infrastructure, Deezer, Waveform, Api.Testing, tests/
src/front/InSeconds.Client/   l'app Angular
docker-compose.yml (Postgres local), docker-compose.staging.yml, docker-compose.prod.yml
```

## Architecture back

Une API (`InSeconds.Api`) découpée en modules (`Modules/<Module>/`), chacun avec son schéma :

| Module | Rôle | Genre |
|---|---|---|
| `Players` | invités, comptes, appareils, cookie, lien magique, rôle admin, droits RGPD | noyau |
| `Catalogue` | le pool de morceaux, leurs métadonnées Deezer, l'état de l'extrait, le sas « À valider », les thèmes | noyau |
| `Social` | groupes entre amis, classement des groupes et classement général | noyau |
| `Gameplay` | la mécanique d'un morceau (manche, correction, indices, tirage) : logique pure, ni table ni route | partagé |
| `Daily` | le défi du jour, parties, score, série et gels, statistiques, admin du jeu | mode |
| `Runs` | la Survie : défis sans fin tirés à la volée, vies, paliers, thèmes, fantôme, niveau, Hits ([`docs/runs/`](docs/runs/README.md)) | mode |

Couches d'un module : `Domain/` (entités, politiques, store), `Application/` (endpoints, handlers, ports de lecture), `Persistence/` (EF), `Contracts/` (ce que les autres modules ont le droit d'utiliser ; Runs n'en a pas). Projets autour : `InSeconds.Infrastructure` (email, observabilité, proxies, rate limiting, CORS, en-têtes ; ne connaît ni l'API ni les modules), `InSeconds.Deezer` (client Deezer en cinq ports, avec cache ; ne connaît rien d'autre), `InSeconds.Waveform` (décode un extrait MP3 en forme d'onde ; ne connaît rien d'autre), `InSeconds.Api.Testing` (hôte de test : faux email, faux Deezer, routes `/api/e2e`, documents OpenAPI ; jamais dans l'image de prod). Contrats entre modules : [`docs/architecture/contrats-entre-modules.md`](docs/architecture/contrats-entre-modules.md).

### Règles dures (vérifiées en CI)

- **Frontières** (`ArchitectureTests`, NetArchTest) : un module n'utilise des autres que leurs `Contracts/`. Un noyau ne connaît aucun mode : un mode **implémente** un contrat du noyau (`IPlayerDataContributor`, `ITrackUsage`, `IMemberPerformanceSource`) ; seule exception nommée, Players → `Daily.Contracts.IStreakGrants`. Daily et Runs ne se voient pas. Le dossier `InSeconds.Api/Infrastructure` ne connaît aucun module, sauf les points d'entrée nommés (`ApiComposition`, `WolverineSetup`, `PlayerDataCommand`, `FreezeDayStatsCommand`). Pas de navigation EF entre modules : des identifiants, et des clés étrangères déclarées par le nom du type.
- **Schémas** : rien dans `public` (vide), chaque entité déclare son schéma, noms en snake_case.
- **Horloge** : jamais `DateTime.UtcNow`/`Now`/`Today` (ni `DateTimeOffset`) dans `InSeconds.Api` : `TimeProvider` ou `IGameCalendar` (`ClockUsageTests`).
- **Ports nommés** par l'intention (`IPlayerStore`, `ICatalogueQueries`…), jamais de repository générique.
- **Endpoints Wolverine.Http** en étapes `LoadAsync` / `Validate` / `Post`, validation FluentValidation, **jamais de `SaveChangesAsync` dans un handler** (transaction Wolverine, outbox dans `messaging` ; exceptions listées dans `HandlerRulesTests`) et **jamais d'`IResult`** (`[EmptyResponse]` pour un 204). Toute route `/api/admin*` reçoit la policy Admin automatiquement.
- **Code Wolverine généré commité** (`Internal/Generated`) : après tout changement de handler ou d'endpoint, `rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write`, **avant de lancer les tests** (ils relisent ce code). Périmé : le job `back-checks` échoue et l'API refuse de démarrer au staging.
- **Erreurs** : ProblemDetails avec `code` stable (`module.raison`, ex. `daily.already_played`) et `traceId`. **Ne jamais renommer un code publié** (le front les traduit).
- **Tests** : `Assert` de xUnit (pas de FluentAssertions) ; une base neuve par classe de tests d'intégration (Testcontainers, copie d'une base modèle migrée). Un piège qui touche le code garde un test nommé, cité dans sa ligne (`PiegeNN_…` pour un nouveau).

### Réglages (`infra.settings`)

Une ligne par réglage : `key` = chemin de configuration complet, `value` en `jsonb`, lus par `IOptionsMonitor<T>` : **tout est relu à chaud**. Écrire : `SettingsStore.SetAsync(key, value)`. Ajouter un réglage = une propriété dans les options du module avec sa valeur par défaut (aucune ligne en base). **Pas de valeur initiale sur une liste ou un dictionnaire** (le binder ajoute aux éléments lus : le défaut va dans une propriété `Effective…`) et **pas de clé de dictionnaire décimale** (le binder laisse le dictionnaire vide sans erreur). L'API refuse de démarrer si les réglages sont incohérents (`DailyOptionsStartupCheck`, `RunsOptionsStartupCheck`). Tableau des clés et défauts : `.claude/rules/back/reglages.md` ; leur sens pour le joueur : [`docs/regles-du-jeu.md`](docs/regles-du-jeu.md), [`docs/runs/regles.md`](docs/runs/regles.md).

### Tâches planifiées (Hangfire, schéma `jobs`)

| Tâche | Cron prod (UTC) | Rôle |
|---|---|---|
| `catalogue-refresh` | `0 23 * * *`, jamais au staging (piège 16) | recontrôle extrait, rang et album du pool, formes d'onde manquantes, genres |
| `daily-generate-challenge` | `0 0 * * *` | le défi du jour ; pool insuffisant : réessai toutes les 10 min pendant 24 h |
| `daily-close-day` | `5 0 * * *` | expire les parties restées en cours, fige les stats de J-2 et avant |
| `players-purge-expired-tokens` | `30 3 * * *` | durées de conservation RGPD (jetons, appareils et pseudos d'invité à 91 jours, comptes inactifs à 3 ans, jamais un admin) |

Au staging, les trois autres tournent 30 min après la prod (même Postgres, jamais en même temps) ; entre minuit et 0 h 30, le défi du staging se génère au premier « Commencer ». Lancer une tâche à la main : tableau de bord `/jobs` (admin seulement).

## Architecture front

Angular 22 standalone **zoneless** (la détection ne part que des signals, des événements du template ou d'un `markForCheck()`), NgRx SignalStore, ngx-translate (FR/EN), CDK Dialog, GSAP (par la seule façade `ui/motion`), Vitest en mode navigateur. Domaines calqués sur les modules : `account`, `gameplay` (la manche, partagée par les modes), `daily`, `runs`, `social`, `admin`, plus `core/` (transverse) et `ui/` (kit visuel), chacun en couches `domain/` (TypeScript pur), `data-access/` (stores, adaptateurs), `feature/` (pages), `ui/` (présentation).

- **Frontières** (`npm run lint:arch` : Sheriff et `check-pure-domain.mjs`) : `ui` n'importe que `ui`, `core` n'importe aucun domaine, seul `data-access` importe les clients générés, `gameplay` n'importe aucun mode, `domain/` sans Angular ni RxJS. Dépendances permises entre domaines : `DOMAIN_DEPENDENCIES` de `sheriff.config.ts`.
- **Un client NSwag par module, plus `admin`** (`src/app/api/<module>/api.generated.ts`, fichier généré commité). Après un changement d'endpoint : régénérer le document OpenAPI côté back, puis `npm run generate-api`, et commiter les deux (job CI `api-clients`).
- **Erreurs** : `ERROR_MESSAGE_KEYS` (`core/errors/error-messages.ts`) est la seule table code → message ; un code inconnu s'affiche avec son `traceId`. Erreurs JS et 5xx remontées à `POST /api/client-errors` ; les violations CSP vont à `/api/csp-reports`, envoyées par le navigateur.
- **Conventions** : un composant = un dossier à son nom, `OnPush`, `input()`/`output()`, écouteurs globaux dans `host: {}`, `TranslatePipe` dans chaque composant qui affiche du texte, un `.spec.ts` pour tout nouveau composant. État des stores en lecture seule, modifié par leurs méthodes, et un nom d'état n'est jamais celui d'une méthode. Modales **uniquement** par `ModalService` (avec `injector: inject(Injector)`), boutons par `appButton`. Couleurs par `var(--…)` (jamais de hex dans un template). Durées par `appSeconds` / `formatSeconds` (« 0,5 s » en français).
- **Mobile first** : tout écran se pense d'abord pour un téléphone. Direction artistique (une couleur = un sens, néon sobre, une seule tuile de focus par écran) : `.claude/rules/front/direction-artistique.md`, que `gardien-da` applique.

## Modèle de données

Base `inseconds` en prod, `inseconds_staging` au staging, un schéma par module, `public` vide.

| Schéma | Tables |
|---|---|
| `players` | `players`, `accounts` (`email` et `pseudo` en `citext` uniques, `is_admin`), `device_sessions`, `legacy_tokens` (reprise des anciens cookies, à retirer), `auth_tokens` |
| `catalogue` | `tracks`, `candidates` (sas « À valider », jamais tiré), `genres`, `track_genres`, `themes`, `track_themes` |
| `daily` | `challenges`, `challenge_tracks`, `sessions` (0 en cours, 1 terminée, 2 abandonnée, 3 expirée), `answers`, `streaks`, `challenge_day_stats` |
| `runs` | `challenges`, `challenge_tracks`, `sessions` (0 en cours, 1 série complète, 2 perdue, 3 abandonnée), `answers`, `records`, `player_levels`, `received_challenges`, `access` |
| `social` | `groups`, `group_members`, `ranking_identity` |
| `infra` | `settings`, `data_protection_keys`, `backup_runs`, `__ef_migrations_history` |
| `messaging` / `jobs` | Wolverine / Hangfire, créées par eux au démarrage (pas par les migrations) |
| `extensions` | `citext` (ce schéma doit être dans le `search_path`) |

- **L'usage d'un morceau** (dernière date, nombre, cooldown) n'est pas stocké : il se calcule sur les `challenge_tracks`. Cooldown du Daily = ⌊ morceaux jouables × `Daily:TrackCooldownPoolPercent` ÷ `Daily:TracksPerChallenge` ⌋ jours.
- **Statistiques** : un jour terminé (J-2 et avant) est figé dans `challenge_day_stats` par `daily-close-day` ; la veille et le jour même restent calculés en direct (piège 18).
- **« Abandonnée »** = clic sur « Abandonner » ; **« expirée »** = laissée en cours sur un défi passé.
- **Une partie par joueur et par défi** ; artiste et titre corrigés séparément ; **le texte saisi n'est jamais stocké**.
- **Migrations EF** appliquées au démarrage (`DatabaseStartupService`) ou par `--migrate-only` (déploiement). Toute nouvelle table avec `player_id` entre dans l'effacement (piège 48).

## Commandes courantes

```bash
docker compose up -d database                    # PostgreSQL local (.env avec DB_PASSWORD)

# Back (depuis src/back)
dotnet build InSeconds.slnx
dotnet test --solution InSeconds.slnx            # tout le back (Docker requis)
rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=inseconds;Username=inseconds;Password=<DB_PASSWORD>" \
  dotnet run --project InSeconds.Api.Testing     # hôte de test sur :5175

# Front (depuis src/front/InSeconds.Client ; Node 24)
npm start                    # :5176, /api /health /jobs relayés vers :5175
npx ng test --watch=false    # Vitest dans Chromium
npm run lint:arch && npm run build
npm run generate-api
```

Le reste (migrations, options de l'API, E2E) : `src/back/CLAUDE.md` et `src/front/CLAUDE.md`.

## Déploiement

Référence complète : [`docs/exploitation/deploiement.md`](docs/exploitation/deploiement.md). Savoir de déploiement (pièges compris) : `.claude/rules/deploy.md`.

- **L'IP publique du VPS n'est jamais écrite dans le dépôt** (ni doc, ni code, ni workflow) : elle permettrait de contourner Cloudflare. Elle vit dans `~/.ssh/config` (alias `vpsovh`), le secret `VPS_HOST` et le DNS.
- **Prod** : push sur `main` → « CI OK » → job `deploy` → `deploy/vps/deploy.sh` (migrations par `--migrate-only` avant de remplacer les conteneurs, test de fumée). **Staging** : push sur `env/staging` → `deploy-staging`, `ASPNETCORE_ENVIRONMENT=Staging` (jamais `Development` ni `Testing` : l'API est publique), base copiée de la prod et anonymisée, tous les emails redirigés.
- La CI ne touche **jamais** `deploy/infra` ni `deploy/caddy` (déploiement manuel).
- **Promouvoir un admin** : SQL manuel uniquement (piège 5).

## Conventions Git

- **Author ET committer de chaque commit : `Clément <clement.rageau@gmail.com>`, jamais Claude.** `--author` seul ne suffit pas (le committer retombe sur la config git) : poser les deux par les variables de la commande, `GIT_AUTHOR_NAME="Clément" GIT_AUTHOR_EMAIL="clement.rageau@gmail.com" GIT_COMMITTER_NAME="Clément" GIT_COMMITTER_EMAIL="clement.rageau@gmail.com" git commit …`, jamais par `git config`. Vérifier : `git log --format='%an <%ae> | %cn <%ce>' -1`.
- **Jamais de ligne `Co-Authored-By`**, jamais de tiret cadratin (U+2014) dans le dépôt, les commits ou les PR.
- Commits atomiques, messages en français ou en anglais.
- Un commit déjà poussé avec un mauvais committer se corrige par `git filter-branch --env-filter …` sur la plage concernée (jamais `rebase -i`), puis `git push --force-with-lease` sur la branche de travail, jamais sur `main`.

Hooks (`.claude/hooks/*.mjs`, branchés dans `.claude/settings.json`, détail et ajout d'un hook : `.claude/hooks/README.md`, tests : `node --test .claude/hooks/tests/hooks.test.mjs`) : `shell-guard` (seul hook des commandes Bash et PowerShell, qui enchaîne les quatre suivants et refuse un git PowerShell qu'il ne sait pas lire), `protected-branches` (refuse commit, merge et push vers `main` ou `env/staging`), `commit-identity` (refuse un author, un committer ou une ligne `Co-Authored-By` hors règle), `lint-before-commit` (`git diff --check`, `dotnet format whitespace` sur les `.cs` touchés, `npm run lint:arch` si le front est touché), `no-em-dash`, `grafana-reminder` (rappel quand un texte lu par un tableau Grafana disparaît d'un `.cs`), `codegen-reminder` (rappel du code Wolverine, du document OpenAPI et du client NSwag après un changement d'endpoint ou de handler), `session-start` (branche courante, alerte sur `main` ou `env/staging`). Un hook qui plante laisse passer. En session cloud, les hooks peuvent ne pas se déclencher : appliquer leurs règles à la main (identité par les variables `GIT_*`, aucune ligne `Co-Authored-By`, aucun tiret cadratin, `npm run lint:arch` et `dotnet format whitespace` avant de commiter).

Skills de projet (`.claude/skills/`, à suivre quand la tâche correspond) : `nouvel-endpoint`, `migration-ef`, `nouveau-reglage`, `e2e-local`, `pr-staging`, `promotion-prod` (sur demande explicite seulement).

Sous-agents (`.claude/agents/`, lecture seule) : `relecteur-pr` **avant de sortir une PR du brouillon ou de la dire prête**, `gardien-code` dès qu'un module, une couche ou un port est touché, `gardien-da` pour un écran ou un style, `gardien-rgpd` pour un journal, une table avec `player_id`, l'export ou l'effacement. Leurs constats se traitent dans la même PR. Un sous-agent qui n'est pas listé sous son nom (session cloud) se remplace par un agent générique qui lit `.claude/agents/<nom>.md`. Une règle qui change ici change aussi dans l'agent ou le hook qui la porte.

## CI et règles de push

`.github/workflows/ci.yml` (push sur toutes les branches). Détail des jobs, des durées et de Dependabot : [`docs/exploitation/ci.md`](docs/exploitation/ci.md).

- **« CI OK »** est le seul check exigé ; **tout nouveau job doit entrer dans ses `needs`**. `deploy` et `deploy-staging` l'attendent.
- Seuls tournent les jobs des zones touchées par rapport à `env/staging` (back, front, E2E et clients pour l'un ou l'autre, rien pour la doc et `.claude/`), tout sur `main` et `env/staging`. Sur une branche de travail, le premier job en échec annule le run, et chaque push annule le run précédent : regrouper les corrections et laisser un run aller au bout avant de dire « CI verte ».
- Les tests d'intégration sont répartis en trois jobs par dossier (`GROUP_1`, `GROUP_2` dans `ci.yml`, le reste au troisième) : renommer un de ces dossiers casse le job.
- Avant de pousser : migration EF générée après un changement d'entité, code Wolverine régénéré, clients NSwag régénérés, `npm run build` et `npm run lint:arch` verts. Une erreur de format ou de lint se corrige en local, jamais en désactivant un check. Les avertissements SonarCloud se traitent dans la même PR (un fichier généré s'exclut dans l'UI SonarCloud).
- **Bumps Angular** : tous les `@angular/*` et `@ngrx/signals` dans la même PR (piège 15).

## Conventions .NET

Solutions `.slnx` ; `global.json` en `rollForward: latestFeature`, qui fixe aussi le lanceur Microsoft.Testing.Platform (`dotnet test --solution …`) ; versions dans `Directory.Packages.props`, avertissements en erreurs ; `net10.0`, nullable et implicit usings.

## Pièges connus

Les numéros sont stables : le code et les tests y renvoient (`PiegeNN_…`, « piège NN »). Un numéro absent est un piège retiré, jamais repris : le prochain piège prend le 51 (récit des pièges 1 à 47 : `git show b38825d:CLAUDE.md`). Le corps d'un piège vit ici s'il est transverse, sinon dans le fichier de règles indiqué.

2. **Healthcheck PostgreSQL** (`pg_isready` dans le conteneur) : `.claude/rules/deploy.md`.
5. **Admin = rôle sur le compte** (`players.accounts.is_admin`), posé **en SQL manuel uniquement**, jamais par le code ; relu en base par `DeviceSessionValidator` (cache d'une minute), jamais écrit dans le cookie. La policy `Admin` protège `/api/admin*` et `/jobs` (`Security/SecurityTests`).
7. **Cookie same-site, jamais `SameSite=None`** : front et API sont same-site ; `__Host-inseconds` en `Lax; Secure; HttpOnly` en prod et staging, `inseconds` en `Strict` en dev et test (`AuthSetup`). `None` fait purger le cookie par Safari (ITP). Le piège 23 en est le corollaire.
8. **Réglages lus en base au démarrage** : seuls « base, schéma ou table absents » sont tolérés ; toute autre erreur SQL empêche le démarrage. Rechargés juste après les migrations.
9. **E2E : `dotnet run` sans `--no-launch-profile` impose `Development`** : toujours `--no-launch-profile` pour l'hôte de test en `Testing`.
10. **E2E : ports** (5175/5176 en CI, 5177/5178 en local) : `.claude/rules/front/e2e.md`.
11. **Tests d'intégration : Docker requis**, un conteneur pour la suite, une base par classe ; `ApiFactory.DisposeAsync` vide les pools Npgsql, sinon la suite atteint la limite de connexions.
13. **Jamais de `catch {}` nu côté Deezer** : `OperationCanceledException` n'est relancée que si l'annulation vient de l'appelant ; un délai interne du `HttpClient` est un échec de Deezer (`Unavailable`). Tests : `DeezerClientTests`.
14. **URL d'extrait Deezer signées, valables 15 min** : aucun cache côté serveur, chaque démarrage de partie redemande des adresses ; côté front, un premier échec de lecture redemande une adresse fraîche une fois (`.claude/rules/front/gameplay-audio.md`). Tests : `DeezerCacheTests`, `track-round.store.spec.ts`, E2E `audio-error.spec.ts`.
15. **Bumps Angular partiels = `npm ci` cassé** : tous les `@angular/*` à la même version exacte, `@ngrx/signals` suit.
16. **Erreurs Deezer en HTTP 200** (quota 4, occupé 700, supprimé 800) : seul 800 est une réponse déterminée (`Missing` / `NotFound`) ; tout le reste donne `Unavailable`, qui **ne change jamais** `preview_status` et ne neutralise jamais un morceau. `catalogue-refresh` espace ses lots et ne tourne pas au staging (même IP, même quota). Tests : `DeezerClientTests`, `TrackTests`, `RefreshPreviewsTests`, `RunPlayTests`.
17. **Clés Data Protection en base, chiffrées par certificat** (`secrets/dataprotection.pfx`, exigé en prod et staging) ; une clé neuve après chaque copie de base (`--rotate-data-protection-key`). Tests : `DataProtectionTests`.
18. **Série : comparer sur la date du défi, jamais sur l'heure de complétion** : la veille reste jouable après minuit, ses stats ne se figent qu'à J-2, un défi plus vieux que la veille est refusé (409 `daily.abandoned`). Tests : `StreakTests`, `PlaySessionTests`, `DayStatsSnapshotTests`.
20. **`Cache-Control` nginx** : bundles hashés `immutable`, le reste en `no-cache` ; en-têtes de sécurité inclus dans chaque `location` (`.claude/rules/deploy.md`).
21. **Scanners de liens dans les emails** : le lien magique et le changement d'email ne se consomment qu'au clic sur « Confirmer », jamais à l'ouverture. Tests : `MagicLinkTests`, specs `verify` / `confirm-email`.
22. **Origine de confiance sur la vérification du lien magique** (seul `POST` public qui pose un cookie à partir d'un secret) : `Origin` ou l'autorité exacte du `Referer` dans `Cors:AllowedOrigins` + `Auth:TrustedOrigins`. Un port de front oublié dans l'hôte de test casse les E2E en silence. Tests : `MagicLinkTests`, `TrustedOriginsTests`.
23. **Jamais `SameSite=None`** (cf. piège 7).
24. **Mémoire** : Workstation GC sans GC concurrent (`InSeconds.Api.csproj`) ; tout `MemoryCache` à `SizeLimit` exige une `Size` sur chaque `Set` ; caches dédiés (`DeezerCache`, `DeviceSessionStatusCache`), jamais l'`IMemoryCache` partagé.
25. **Cache Docker et horodatage du build** : `.claude/rules/deploy.md`.
26. **`caddy reload` ne suffit pas après un `git reset --hard` du Caddyfile** : `.claude/rules/deploy.md`.
27. **`X-Forwarded-For` derrière Cloudflare puis Caddy** : deux sauts à dérouler (`TrustedProxyNetworks`, `ForwardLimit = null`), sinon le rate limiting compte l'IP d'un edge Cloudflare. Tests : `ForwardedHeadersAndRateLimitingTests`.
28. **Filtre texte sur plusieurs champs** (« Artiste Titre ») : `.claude/rules/front/admin.md`.
29. **État `[LoggerMessage]` recyclé après l'appel** : un logger de test copie les propriétés au moment de l'appel (`CapturingLogger`).
30. **Lien magique ouvert dans un navigateur déjà connecté** : un compte déjà lié n'est **jamais** converti, l'adresse sans compte obtient un nouveau joueur (`AccountSignIn`). Tests : `MagicLinkTests`.
31. **Rien qui identifie un morceau avant la réponse** : ni artiste, ni titre, ni année, ni identifiant Deezer au démarrage d'une partie ; pochette et lien Deezer n'arrivent qu'avec la réponse ; les stats du jour ne montrent les morceaux qu'à qui a fini (partie terminée, expirée, ou abandonnée après au moins une réponse ; abandonnée sans réponse : rien). Tests : `TodayStatsTests`, `StartSessionTests`, E2E `answers-hidden.spec.ts`.
32. **Réponse perdue sur coupure réseau** : `.claude/rules/front/daily.md`.
33. **Échec de lecture = état `error`, jamais `idle`** : `.claude/rules/front/gameplay-audio.md`.
34. **`trusted_proxies` dans le Caddyfile** : `.claude/rules/deploy.md`.
35. **Verrou du morceau en cours et plancher d'écoute** : le morceau en cours est le premier sans réponse, un autre ne prend pas le verrou (409 `daily.track_lock_not_released`) ; l'écoute garde le maximum vu par le serveur, une réponse sous ce plancher est refusée (400 `daily.listened_duration_below_verified_minimum`), le niveau d'indice vient de la session, jamais du client. Vaut aussi pour Runs. Tests : `PlaySessionTests`, `UnitTests/Gameplay`.
36. **Jamais le texte d'une recherche dans les journaux**, seulement sa longueur ; le tag `url.query` est absent ou masqué. Tests : `SearchTelemetryTests`, `DeezerClientTests`.
37. **Une erreur de base ne déconnecte jamais** : la validation de l'appareil qui ne lit pas la base répond 500 ; seul un cookie réellement invalide ou révoqué est rejeté. Tests : `CookieValidationTests`, `LegacyCookieTests`.
38. **Fin de partie sur le nombre réel de morceaux du défi**, jamais sur `TracksPerChallenge` (`DailySession.Answer`). Tests : `PlaySessionTests`.
39. **Déconnexion = cet appareil seulement** ; « déconnecter les autres appareils » est une action à part. Tests : `DevicesTests`.
40. **« Écouter plus » et relecture** : `.claude/rules/front/gameplay-audio.md`.
41. **Statistiques du jour en échec** : `.claude/rules/front/daily.md`.
42. **Réponse Deezer tardive dans la fenêtre d'écoute** : `.claude/rules/front/admin.md`.
43. **Déploiement par la CI** (clé d'hôte épinglée, `prune -f` jamais `-a`, concurrency propre) : `.claude/rules/deploy.md`.
44. **Arrêt du palier calé sur le son réel**, écoute automatique une fois par morceau : `.claude/rules/front/gameplay-audio.md`.
45. **Copie presse-papier intermittente** : `.claude/rules/front/core-pwa.md`.
46. **Faux événement `playing` de Safari** : `.claude/rules/front/gameplay-audio.md`.
47. **Conditions de l'API Deezer** : usage strictement non commercial, extraits de 30 s seulement, **aucun audio ni aucune image Deezer stockés** (ni dans un cache persistant du navigateur : `ngsw-config.json` n'a aucun `dataGroups`) ; seules des métadonnées et des valeurs dérivées (forme d'onde, piège 50) sont gardées. Les captures de `docs/**/maquettes/` se prennent pochettes masquées. Détail : [`docs/conformite/conditions-api-deezer.md`](docs/conformite/conditions-api-deezer.md).
48. **Effacement d'un joueur complet** : `AccountErasure` supprime ses données de jeu (chaque mode par `IPlayerDataContributor`), puis tout ce que Players garde de lui. **Toute nouvelle table avec une colonne `player_id` doit y entrer.** Tests : `PlayerDataTests` (lit toutes les colonnes `player_id` dans `information_schema`), `PlayersPurgeTests`, `PlayerDataCommandTests`.
49. **Le service worker garde la CSP de son installation** : toute origine tierce lue par la page doit aussi être en `connect-src`, et `Dockerfile.prod` ajoute l'empreinte de la CSP à `ngsw-worker.js` pour qu'il se réinstalle quand elle change (`.claude/rules/deploy.md`, `.claude/rules/front/core-pwa.md`).
50. **Forme d'onde calculée par l'API** (`InSeconds.Waveform`, MPEG-1 44,1 kHz) : un seul calcul à la fois (verrou consultatif 474), extrait remplacé détecté au nom de fichier, téléchargement limité à `*.dzcdn.net` et 3 Mo, jamais d'URL signée dans un journal, rien de calculé au staging (la copie de la prod apporte les formes). Détail : `.claude/rules/back/catalogue-deezer.md`.

## Ce que fait l'application

Une ligne par surface ; le détail fonctionnel est dans la doc citée, les libellés dans `public/i18n/{fr,en}.json`.

- **Défi du jour** (`/daily`, `/` sans l'accès Survie) : accueil, manche par paliers avec indices et autocomplétion, révélation, résultat du jour, partage, série et gels (comptes seulement). [`docs/regles-du-jeu.md`](docs/regles-du-jeu.md).
- **Réponses des jours passés** (`/history/daily/aaaa-mm-jj`) : publiées dès le lendemain, en pourcentages, **rien sous 5 joueurs**. [`docs/regles-du-jeu.md`](docs/regles-du-jeu.md).
- **Survie** (`/survie`, `/survie/<code>` ; sur invitation : lien d'un ami **réservé aux comptes qui ont l'accès**) : vies, manches, paliers, thèmes, fantôme, duels, niveau et disques, Hits (`/survie/hits`). [`docs/runs/regles.md`](docs/runs/regles.md), [`docs/runs/ecrans.md`](docs/runs/ecrans.md).
- **Interface Survie** (pour un compte qui a l'accès) : accueil à deux cartes, barre du bas (Accueil, Classements, Historique, Mon compte), historique `/history/daily` et `/history/survie`.
- **Groupes et classements** (`/ranking`, `/ranking/new`, `/ranking/join/<code>`, `?view=general`) : seuls les membres d'un groupe voient ses pseudos ; le classement général réunit les comptes autorisés qui ont fini une partie, **jamais un admin**, sous leur pseudo ou un alias musical. [`docs/runs/regles.md`](docs/runs/regles.md).
- **Compte** (`/account/**`) : lien magique, pseudo, changement d'email, appareils, « Tes données » (export, suppression). [`docs/conformite/rgpd.md`](docs/conformite/rgpd.md).
- **Admin** (`/admin/**`, rôle `is_admin`) : Accueil, Défis, Contenu (Morceaux, Thèmes, À valider), Groupes, Joueurs, panneau technique. `.claude/rules/front/admin.md`.
- **Transverse** : FR/EN, PWA (nouvelle version appliquée à un moment sûr), overlay « Service indisponible », pages `/legal` et `/privacy`, anciennes adresses redirigées en gardant la query string.
- **Observabilité** : OpenTelemetry vers Grafana Cloud **en prod seulement** ; **jamais d'email, de pseudo, de réponse saisie, de cookie ni d'`Authorization` dans la télémétrie** (testé). Tableaux dans `deploy/grafana/` : renommer une métrique ou un texte de journal qu'ils lisent les vide.

## Reste à faire et décisions

- Reste à faire : [`docs/taches.md`](docs/taches.md).
- Décisions déjà prises et leur raison (pas de mot de passe, monolithe modulaire, Wolverine, Hangfire, élément audio HTML…) : [`docs/architecture/decisions.md`](docs/architecture/decisions.md). **À lire avant de proposer une fonctionnalité**, pour ne pas rediscuter une décision prise.

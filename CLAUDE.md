# CLAUDE.md - InSeconds

Instructions pour Claude quand il travaille dans ce repo. Pour la documentation utilisateur, voir [README.md](README.md) / [README.fr.md](README.fr.md).

## Vue d'ensemble

InSeconds = blind test musical quotidien. N morceaux par jour (`Daily:TracksPerChallenge`, défaut 5). La lecture démarre au palier le plus court et le joueur prolonge l'écoute s'il le veut (paliers : 0.5, 1, 1.5, 2, 3, 5, 10 s) avant de tenter artiste + titre. Moins de temps écouté = plus de points. Même défi pour tout le monde, même jour (jour UTC). Mode invité (joue sans s'inscrire), comptes optionnels par lien magique. Règles produit : [`docs/regles-du-jeu.md`](docs/regles-du-jeu.md).

Stack : .NET 10 / Wolverine / EF Core / PostgreSQL 17 / Hangfire côté back (monolithe modulaire), Angular 22 zoneless / NgRx SignalStore / Tailwind v4 / élément audio HTML côté front (PWA). **Hébergé sur un VPS OVH** (Debian 13, Gravelines) : front + API + PostgreSQL en conteneurs Docker derrière Caddy et Cloudflare, détail dans [Déploiement](#déploiement). Domaine public : `https://inseconds.cc` (API : `https://api.inseconds.cc`). **La page de rebond GitHub Pages (`oasis35.github.io/InSeconds`) a été retirée**, ne pas la recréer.

## État du dépôt

Le code est dans `src/`, décrit par ce fichier et ses deux compagnons : [`src/back/CLAUDE.md`](src/back/CLAUDE.md) et [`src/front/CLAUDE.md`](src/front/CLAUDE.md). Ces documents ne décrivent que l'application telle qu'elle est ; son histoire est dans [`docs/historique/`](docs/historique/). Sommaire de la doc : [`docs/README.md`](docs/README.md).

- **Staging** (`dev.inseconds.cc`) et **prod** (`inseconds.cc`) servent le même code, `env/staging` n'ayant d'avance que les PR pas encore promues (dernier merge `env/staging` → `main` : #457, le 28/10/2026).
- **PR** : vers `env/staging` (testée au staging), puis `env/staging` → `main` pour la prod, en merge commit (jamais squash : il crée des conflits au merge suivant). Un correctif urgent peut viser `main`, remergée ensuite dans `env/staging`.
- Branches `main` et `env/staging` protégées (ruleset GitHub : PR obligatoire, pas de force-push ni de suppression, check « CI OK » exigé).

## Ports (ATTENTION - non standards)

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
├── .claude/                        # hooks et sous-agents Claude Code (cf. § Hooks et sous-agents)
├── docker-compose.yml              # dev local : PostgreSQL
├── docker-compose.staging.yml      # staging
├── docker-compose.prod.yml         # prod
├── deploy/
│   ├── infra/                      # Postgres partagé du VPS, sauvegardes
│   ├── caddy/                      # reverse proxy partagé
│   ├── grafana/                    # tableaux de bord Grafana Cloud (JSON à importer)
│   └── vps/                        # deploy.sh, smoke-test.sh, copie prod → staging (+ staging-anonymize.sql)
├── docs/                           # README (sommaire), règles du jeu, tâches, architecture/, exploitation/, conformite/, historique/
├── src/
│   ├── back/                       # InSeconds.slnx : Api (modules), Infrastructure, Deezer, Api.Testing, tests/
│   └── front/InSeconds.Client/     # app Angular
└── README.md / README.fr.md
```

## Architecture back

> Détail complet (chaque module, routes, tâches, authentification, hôte de test) : [`src/back/CLAUDE.md`](src/back/CLAUDE.md). Ci-dessous : les règles qu'il faut avoir en tête avant de toucher au code.

**Monolithe modulaire.** Une seule API (`InSeconds.Api`), découpée en modules dans `Modules/<Module>/` :

| Module | Rôle | Schéma |
|---|---|---|
| `Players` | invités, comptes, appareils (sessions), cookie, lien magique, rôle admin | `players` |
| `Catalogue` | les morceaux du pool, leurs données Deezer, l'état de leur extrait | `catalogue` |
| `Gameplay` | la mécanique d'un morceau (manche, correction, indices, tirage) : logique pure, ni table ni route | - |
| `Daily` | le défi du jour, les parties, le score, la série et les gels, les statistiques, l'admin du jeu | `daily` |
| `Runs` | le second mode (Run, nom affiché « Platines ») : défis tirés par difficulté, règles figées, accès sur invitation, la partie (jauge, neutralisation, fin, record) ses écrans, le lien d'un ami et la comparaison des joueurs d'une playlist (docs/runs) | `runs` |

Chaque module a ses couches `Domain/` (entités aux invariants encapsulés, politiques, et le store : écritures et agrégats suivis), `Application/` (endpoints, handlers, et les ports de lecture : `I…Queries`, projections directes), `Persistence/` (EF), `Contracts/` (ce que les autres modules ont le droit d'utiliser). Projets autour : `InSeconds.Infrastructure` (email, observabilité, proxies, rate limiting, CORS, en-têtes : ne connaît ni l'API ni les modules), `InSeconds.Deezer` (client Deezer en quatre ports, avec cache : ne connaît rien d'autre), `InSeconds.Api.Testing` (hôte de test : faux email, faux Deezer, routes `/api/e2e`, documents OpenAPI ; jamais dans l'image de prod).

### Règles dures (vérifiées en CI)

- **Un module n'utilise des autres que leur dossier `Contracts/`** ; `Gameplay` ne connaît aucun mode ; `Catalogue` et `Gameplay` ne connaissent aucun mode ; Daily et Runs ne se voient pas ; un noyau ne voit d'un mode que ses `Contracts` (Players → `Daily.Contracts.IStreakGrants`) ; le dossier `InSeconds.Api/Infrastructure` ne connaît aucun module, sauf la composition et les points d'entrée nommés (`ApiComposition`, `WolverineSetup`, `PlayerDataCommand`, `FreezeDayStatsCommand`), l'authentification du joueur vivant dans `Modules/Players/Auth`. Tests d'architecture (`tests/InSeconds.ArchitectureTests`, NetArchTest). Pas de navigation EF entre modules : des identifiants, et des clés étrangères déclarées par le nom du type.
- **Rien dans le schéma `public`** (il est vide) ; chaque entité déclare son schéma ; noms en snake_case.
- **Jamais `DateTime.UtcNow`/`Now`/`Today`** dans `InSeconds.Api` : `TimeProvider` ou `IGameCalendar` (`ClockUsageTests`).
- **Pas de repository générique** : chaque module a ses ports nommés par l'intention (`IPlayerStore`, `IDailyStore`, `ICatalogueQueries`…).
- **Endpoints en Wolverine.Http**, en étapes `LoadAsync` / `Validate` / `Post`, validation FluentValidation, **jamais de `SaveChangesAsync` dans un handler** (transaction Wolverine, outbox dans le schéma `messaging` ; exceptions écrites : `SettingsStore.SetAsync`, la reprise des anciens cookies, `--freeze-day-stats`, les genres du contrôle nocturne) et **jamais d'`IResult`** (`[EmptyResponse]` pour un 204), vérifiés par `HandlerRulesTests`. Toute route `/api/admin*` reçoit la policy Admin automatiquement.
- **Code Wolverine généré commité** (`Internal/Generated`, codegen statique en prod et staging, relu aussi par les tests) : après tout ajout ou changement de handler, `rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write`, **avant de lancer les tests** (ils utiliseraient l'ancien code). Le job CI `back-checks` échoue s'il est périmé, et l'API refuse de démarrer en staging.
- **Erreurs** : ProblemDetails avec `code` stable (`module.raison`, ex. `daily.already_played`) et `traceId`. **Ne jamais renommer un code publié** (le front les traduit).
- **Pièges audio, sécurité, Deezer** : un piège = un test nommé (cf. [Pièges connus](#pièges-connus)).
- **Tests** : `Assert` de xUnit (pas de FluentAssertions), une base neuve par classe de tests d'intégration (Testcontainers, copie d'une base modèle déjà migrée).

### Réglages (`infra.settings`)

Une ligne par réglage : `key` = chemin de configuration complet, `value` en `jsonb`. Chargés dans `IConfiguration`, lus par `IOptionsMonitor<T>` : **tout est relu à chaud**. Écrire un réglage : `SettingsStore.SetAsync(key, value)`. Ajouter un réglage = une propriété dans les options du module avec sa valeur par défaut (aucune ligne en base nécessaire) ; **pas de valeur initiale sur une liste ou un dictionnaire** (le binder ajoute aux éléments lus : défaut dans une propriété `Effective…`), et **pas de clé de dictionnaire décimale** (le binder laisse le dictionnaire vide sans erreur). Détail : `src/back/CLAUDE.md` § Réglages.

| Clé | Défaut | Remarque |
|-----|--------|----------|
| `Daily:GuessTimerSeconds` | `20` | exposé, appliqué nulle part (cf. [`docs/regles-du-jeu.md`](docs/regles-du-jeu.md)) |
| `Daily:AllowedDurationsSeconds` | `[0.5,1,1.5,2,3,5,10]` | |
| `Daily:TracksPerChallenge` | `5` | ne change que les défis à venir (piège 38) |
| `Daily:DurationScores` | `[{"seconds":0.5,"score":1000},{"seconds":1,"score":850},…,{"seconds":10,"score":100}]` | liste d'objets |
| `Daily:TrackCooldownPoolPercent` | `75` (de 10 à 90) | part du pool jouable en cooldown, modifiable depuis l'onglet Actions de l'admin : cooldown en jours = ⌊ jouables × part ÷ `TracksPerChallenge` ⌋, recalculé à chaque tirage (#275) |
| `Daily:HintUnlockDurationsSeconds` | `[5,10]` | |
| `Daily:HintPenaltyPercent` | `{"1":30,"2":60}` | |
| `Daily:StreakFreezeEveryDays` / `StreakFreezeMax` / `StreakLostNudgeMinDays` | `7` / `2` / `2` | gel de série |
| `Runs:Rounds` / `TracksPerRound` / `ListenSeconds` | `4` / `5` / `10` | manches, morceaux par manche, écoute fixe ; figés dans chaque défi à sa création, contrôlés au démarrage **et** à l'usage |
| `Runs:ThresholdPercents` / `MinMultiplier` / `MaxMultiplier` / `Discs` | `[40,50,60,70]` / `1` / `2` / clés `runs.discs.*` | jauge par manche, multiplicateur de points de la première à la dernière manche, disques (clés de traduction) |
| `Catalogue:CoverUrlTemplate` | `https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg` | |
| `Catalogue:Refresh:BatchSize` / `BatchDelay` | `10` / 1,5 s | cadence du contrôle nocturne des extraits |

L'API refuse de démarrer si les réglages du jeu sont incohérents (`DailyOptionsStartupCheck`).

### Tâches planifiées (Hangfire, schéma `jobs`)

| Tâche | Cron (UTC) | Rôle |
|---|---|---|
| `catalogue-refresh` | `0 23 * * *` (jamais en staging : même IP que la prod, piège 16) | recontrôle l'extrait, le rang et l'album Deezer de tout le pool jouable (cooldown compris), puis rattrape les genres des albums jamais lus |
| `daily-generate-challenge` | `0 0 * * *` | génère le défi du jour ; pool insuffisant : réessai toutes les 10 min pendant 24 h |
| `daily-close-day` | `5 0 * * *` | expire les parties restées en cours, fige les statistiques de J-2 et avant |
| `players-purge-expired-tokens` | `30 3 * * *` | durées de conservation (RGPD) : jetons expirés, appareils sans visite depuis 91 jours, comptes inactifs depuis 3 ans (jamais un admin) ; une transaction par étape |

En staging, les trois autres tâches tournent **30 min après la prod** (0 h 30, 0 h 35 et 4 h UTC, `appsettings.Staging.json`), pour que les deux instances du VPS ne travaillent jamais en même temps sur le même Postgres ; entre minuit et 0 h 30, le défi du staging est généré à la volée au premier « Commencer ». Les horaires attendus du projet healthchecks.io « [Dev]InSeconds » suivent ce décalage.

Tableau de bord `/jobs` (admin seulement ; pas de Cloudflare Access, ni en prod ni au staging : la policy Admin suffit) : c'est là qu'on lance une tâche à la main. L'onglet Actions de l'admin n'affiche que le dernier passage de chaque tâche (`GET /api/admin/jobs/last-runs`).

## Architecture front

> Détail complet (domaines, stores, lecteur audio, E2E, clients NSwag) : [`src/front/CLAUDE.md`](src/front/CLAUDE.md).

Angular 22 standalone, **zoneless** (la détection de changement ne part que des signals, des événements du template ou d'un `markForCheck()`), NgRx SignalStore, ngx-translate (FR/EN), CDK Dialog, lecteur audio sur un élément `Audio` (#309), service worker (PWA, nouvelle version appliquée à un moment sûr). Tests : Vitest en mode navigateur (Chromium).

- **Domaines** calqués sur les modules du back : `account`, `gameplay` (la manche, partagée par les modes), `daily`, `runs`, `admin`, plus `core/` (transverse) et `ui/` (kit visuel). Chacun en quatre couches : `domain/` (TypeScript pur), `data-access/` (stores, adaptateurs API), `feature/` (pages routées), `ui/` (présentation).
- **Frontières vérifiées par Sheriff** (`npm run lint:arch`, job CI `front`) : `ui` n'importe que `ui`, `core` n'importe aucun domaine, seul `data-access` importe les clients générés, `gameplay` n'importe aucun mode, `domain/` sans Angular ni RxJS.
- **Un client NSwag par module** (`src/app/api/<module>/api.generated.ts`, **fichier généré commité**), produit depuis le document OpenAPI sauvegardé par l'hôte de test. Après tout changement d'endpoint : régénérer le document côté back, puis `npm run generate-api`, et commiter les deux.
- **Erreurs** : `ERROR_MESSAGE_KEYS` (`core/errors/error-messages.ts`) est la seule table code → message ; un code inconnu s'affiche avec son `traceId`. Remontée des erreurs JS, des 5xx et des violations CSP vers `POST /api/client-errors`.
- Routes : `/` → `/daily` ; `/daily/archive/aaaa-mm-jj` (réponses d'un jour passé, `/daily/archive` ouvre le plus récent) ; `/runs` et `/runs/<code>` (le mode Run, le lien d'un ami) ; `/account/**`, `/admin/**`, `/legal` (mentions légales), `/privacy` (confidentialité) ; les anciennes adresses (`/blindtest`, `/login`, `/profile`, `/confidentialite`…) sont redirigées en gardant la query string.

### Conventions

- Couleurs par `var(--…)` (tokens `:root` de `styles.scss`, jamais de hex dans un template), hovers par `hover:` Tailwind.
- Un composant = un dossier à son nom avec `.ts` (+ `.html` s'il est long), l'admin rangeant en plus les siens par onglet ; tout nouveau composant a son `.spec.ts` (pages et fenêtres comprises, des composants plus anciens n'en ont pas encore), `ChangeDetectionStrategy.OnPush`, écouteurs globaux dans `host: {}`, `TranslatePipe` dans chaque composant qui affiche du texte.
- État exposé en lecture seule, modifié par les méthodes du store ; un nom d'état ne doit pas être celui d'une méthode du même store.
- Modales **uniquement** par `ModalService` (avec `injector: inject(Injector)` pour retrouver les stores de la page), boutons par `appButton`.
- **Identité visuelle** : grille synthwave et fond violet ; boutons en rectangle (`rounded-(--radius-button)`, 10 px, dégradé et capitales gardés pour le bouton principal), cartes aux coins réguliers (`--radius-card`, 16 px), pochettes rondes, accès de l'en-tête en ronds gris à contour neutre (`--border-neutral`), sans fond ni lueur, bouton principal sans lueur sur l'accueil et la reprise. **Une couleur = un sens** : orange (et son dégradé) pour le joueur et ce qu'il fait, cyan pour le son et le temps (plus le gel et la grille), violet pour les autres joueurs (histogrammes, égaliseur, médiane), vert et rouge pour juste ou faux ; une action sans sens propre (« Passer », indices, « Connexion » de l'en-tête, « Créer un compte » de l'accueil (sous le relevé de série, avec sa phrase en dessous), « Abandonner » et « Ne plus perdre mes parties » de la reprise, toasts de série) en contour neutre (`--border-neutral`). Capitales réservées au logo et aux boutons, étiquettes et titres en casse normale. Durées au format de la langue par `appSeconds` / `formatSeconds` (`ui/format/`) : « 0,5 s » en français.
- Mobile first : toute proposition d'écran se pense d'abord pour un téléphone. Champs de saisie à 16 px au moins sur écran tactile (sinon Safari sur iPhone zoome au toucher et garde le zoom ; règle `@media (pointer: coarse)` de `styles.scss`).

## Modèle de données

Base PostgreSQL `inseconds` en prod, `inseconds_staging` en staging, avec un schéma par module ; `public` est vide.

| Schéma | Tables |
|---|---|
| `players` | `players` (un invité = un joueur sans compte ; un compte effacé disparaît pour de bon, sans suppression logique ; `acquisition_source` : d'où est arrivé l'invité, `utm_source` ou domaine du référent nettoyé, `direct`, `other`), `accounts` (`email` et `pseudo` en `citext` uniques, `is_admin`), `device_sessions` (un appareil connecté, révocable), `legacy_tokens` (reprise des anciens cookies `authToken`, à supprimer, #237), `auth_tokens` (lien de connexion et changement d'email, hachés) |
| `catalogue` | `tracks` (`deezer_track_id` unique, `cover_hash` seul, `release_year`, `deezer_rank`, `album_id` Deezer, `genres_checked_at` (vide : genres pas encore lus), `preview_status` 0 inconnu / 1 disponible / 2 absent, `disabled_at`), `genres` (`id` = celui de Deezer, `name`), `track_genres` (`track_id`, `genre_id` : les genres de l'album du morceau) |
| `daily` | `challenges` (`date` unique, `seed`, `origin`), `challenge_tracks` (PK `(challenge_id, position)`), `sessions` (unique `(player_id, challenge_id)`, `status` 0 en cours / 1 terminée / 2 abandonnée / 3 expirée, verrou du morceau en cours), `answers` (PK `(session_id, position)`), `streaks`, `challenge_day_stats` (photo figée d'un jour terminé, `payload jsonb`) |
| `infra` | `settings`, `data_protection_keys` (chiffrées par certificat), `__ef_migrations_history`, `import_state` (hors migrations : date d'ouverture de l'application, plus lue par le code) |
| `messaging` | outbox et files durables de Wolverine (créées par Wolverine au démarrage, pas par les migrations) |
| `runs` | `challenges` (`code char(6)` unique = le lien, `seed`, `rules jsonb` figées, `created_by` nullable), `challenge_tracks` (PK `(challenge_id, position)`, `round`, `multiplier`), `sessions` (unique `(challenge_id, player_id)`), `answers` (PK `(session_id, position)`, jamais le texte saisi), `records` (record perso), `access` (l'interrupteur de l'admin) |
| `jobs` | tables de Hangfire (créées par Hangfire au démarrage) |
| `extensions` | `citext` (ce schéma doit être dans le `search_path`, cf. `src/back/CLAUDE.md` § Règles) |

- **L'usage d'un morceau** (dernière date, nombre d'usages, cooldown) n'est pas stocké : il se calcule sur `challenge_tracks`. **Le cooldown suit la taille du pool** (#275) : ⌊ morceaux jouables × `Daily:TrackCooldownPoolPercent` ÷ `Daily:TracksPerChallenge` ⌋ jours (800 morceaux à 75 % : 120 jours) ; un morceau tiré le jour J redevient tirable à J + cooldown + 1, la date de déblocage du pool admin. Sous 14 jours, l'admin est averti (rien n'est bloqué).
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

# Front (depuis src/front/InSeconds.Client ; Node 24)
npm ci
npm start                    # :5176, /api /health /jobs relayés vers :5175
npx ng test --watch=false    # Vitest dans Chromium
npm run lint:arch            # frontières Sheriff
npm run build
npm run generate-api         # clients NSwag, depuis les documents OpenAPI sauvegardés par le back
E2E_DB_CONNECTION="Host=localhost;…;Database=inseconds_e2e;…" npm run e2e   # Playwright : démarre l'hôte de test (:5177) et ng serve (:5178)
```

Détail des options de l'API (`--migrate-only`, `--rotate-data-protection-key`, `--freeze-day-stats`) : `src/back/CLAUDE.md` § Démarrage.

## Déploiement

VPS OVH (Debian 13, Gravelines, 2 vCores, 4 Go, 40 Go) partagé avec de futurs projets : Postgres 17 partagé (`deploy/infra/`), Caddy partagé (`deploy/caddy/`, certificat par challenge DNS Cloudflare), puis la stack InSeconds (`docker-compose.prod.yml` : `api` + `front`, aucun port publié). Cloudflare devant tout, 80/443 restreints à ses plages. Référence complète (durcissement, stacks, staging, sauvegardes, restauration, commandes utiles, droits RGPD sur le VPS) : [`docs/exploitation/deploiement.md`](docs/exploitation/deploiement.md).

- **L'IP publique du VPS n'est jamais écrite dans le dépôt** (ni doc, ni code, ni workflow) : la publier permettrait de contourner Cloudflare. Elle vit dans le `~/.ssh/config` local (alias `vpsovh`), le secret GitHub `VPS_HOST` et le DNS Cloudflare.
- **Prod** : push sur `main` → « CI OK » → job `deploy` → `deploy/vps/deploy.sh` (certificat Data Protection vérifié, migrations par `--migrate-only` avant de remplacer les conteneurs, test de fumée, santé). La CI ne touche **jamais** `deploy/infra` ni `deploy/caddy` (déploiement manuel).
- **Staging** (`dev.inseconds.cc` / `api-dev.inseconds.cc`) : push sur `env/staging` → `deploy-staging`. `ASPNETCORE_ENVIRONMENT=Staging`, jamais `Development` ni `Testing` (l'API est publique). Base copiée de la prod et anonymisée (workflow « Copy prod DB to staging ») ; **tous les emails redirigés** vers `EmailRedirect:To`, l'API refuse de démarrer sans. `catalogue-refresh` n'y tourne pas (piège 16).
- **Sauvegardes** : `deploy/infra/backup.sh` chaque nuit à 3 h UTC (timer systemd du VPS, hors de l'API), chiffrées vers Cloudflare R2, surveillées par healthchecks.io.
- **Promouvoir un admin** : SQL manuel uniquement (piège 5, commande dans [`deploiement.md`](docs/exploitation/deploiement.md#commandes-utiles-vps)).
- **`/sitemap.xml`** du domaine du front est envoyé par Caddy à l'API (jours publiés, #407), en prod et au staging : à redéployer à la main avec `deploy/caddy` (`docker restart caddy`, piège 26).
- **Accès SSH** : clé (`ssh vpsovh`) et mot de passe de secours, cf. [`docs/exploitation/acces-secours-ssh.md`](docs/exploitation/acces-secours-ssh.md).

## Conventions Git

- **Pas de `Co-Authored-By: Claude` dans les commits**, jamais
- **Author ET committer de CHAQUE commit doivent être l'utilisateur, jamais Claude** - l'identité git par défaut de cet environnement (`user.name`/`user.email`, ex. `Claude <noreply@anthropic.com>`) ne doit **jamais** apparaître dans l'historique, ni comme author ni comme committer, aucune exception. `git commit --author="<nom> <email>"` seul est **insuffisant** : ça ne fixe que l'author, le committer retombe silencieusement sur `user.name`/`user.email` de la config git locale (ne jamais modifier cette config globale, cf. règles de sécurité git). Poser explicitement les deux avant chaque commit, ex. `GIT_AUTHOR_NAME="..." GIT_AUTHOR_EMAIL="..." GIT_COMMITTER_NAME="..." GIT_COMMITTER_EMAIL="..." git commit -m "..."` (variables d'environnement locales à la commande, pas de `git config`). Vérifier après coup avec `git log --format='%an <%ae> | %cn <%ce>' -1`. Si des commits déjà poussés ont un committer incorrect, les corriger (`git filter-branch --env-filter ...` sur la plage concernée, jamais `rebase -i`) puis `git push --force-with-lease` sur la branche de travail (jamais sur `main`).
- Préférer commits atomiques, messages clairs (FR ou EN, peu importe)
- Branche de travail : `feat/<sujet>` (ex: `feat/redis-cache`), jamais de commit direct sur `main` ni `env/staging`. Cible des PR : `env/staging` (déployée sur le staging pour y être testée), puis une PR `env/staging` → `main` pour la prod ; `main` directement seulement pour un correctif urgent de la prod (cf. [État du dépôt](#état-du-dépôt)). Une demande de suivi = un commit de plus sur la même branche

## Hooks et sous-agents Claude Code

Versionnés dans `.claude/` (le reste de `.claude/`, dont `settings.local.json`, reste local). Les hooks sont des scripts Node sans dépendance (`.claude/hooks/*.mjs`), branchés dans `.claude/settings.json` ; un hook qui plante laisse passer (il ne bloque que sur une règle enfreinte). Tests : `node --test .claude/hooks/tests/hooks.test.mjs` (dépôts git jetables, pas de CI).

| Hook | Quand | Effet |
|---|---|---|
| `protected-branches` | avant une commande Bash | refuse un `commit` / `merge` / `revert` / `cherry-pick` / `am` sur `main` ou `env/staging`, et tout `git push` vers l'une d'elles (`origin main`, `HEAD:main`, `--delete`, `--all`, `git push` nu depuis `main`) ; suit un `git checkout -b` fait plus tôt dans la même commande ; un `git pull` reste permis |
| `commit-identity` | avant une commande Bash | refuse un commit dont l'author ou le committer n'est pas `Clément <clement.rageau@gmail.com>` (variables `GIT_*` de la commande ou d'un `export`, sinon config git ; `--author`, `--amend` compris), ou dont le message (y compris `-F`) a une ligne `Co-Authored-By` ; vérifie aussi le committer de `merge`, `revert`, `pull`, `rebase`, `cherry-pick`, `am` (`--ff-only` suffit pour un pull ou un merge sans commit de fusion) |
| `lint-before-commit` | avant un `git commit` | sur les fichiers modifiés : `git diff --check` hors Markdown, `dotnet format whitespace` sur les `.cs` touchés (hors code généré et migrations), `npm run lint:arch` si le front est touché ; un outil absent est signalé sans bloquer |
| `no-em-dash` | avant Write, Edit, MultiEdit, NotebookEdit, un Bash qui écrit (commit, `gh`, redirection, `tee`, `sed -i`) et les outils GitHub | refuse tout tiret cadratin (U+2014) ; le dépôt n'en contient aucun |
| `grafana-reminder` | après l'édition d'un `.cs` | si un texte de filtre Loki ou un nom de métrique lu par `deploy/grafana/*.json` disparaît du fichier, rappelle de mettre le tableau à jour (ne bloque rien) |

Sous-agents (`.claude/agents/`, en lecture seule, ils rendent des constats sans rien modifier) : `relecteur-pr` (relecture du diff avant de dire qu'une PR est prête : bugs, règles dures, fichiers générés, tests, doc), `gardien-code` (architecture et SOLID : frontières des modules, couches, ports, décisions déjà prises), `gardien-da` (direction artistique : mobile first, une couleur = un sens, rien qui fasse « généré par IA »), `gardien-rgpd` (journaux sans donnée personnelle, effacement et export complets, `/privacy` et `docs/conformite/rgpd.md` à jour). Leur règle de référence reste ce fichier et les docs qu'ils citent : une règle qui change ici change aussi dans l'agent ou le hook concerné.

## CI et règles de push

Workflow `.github/workflows/ci.yml` (push sur toutes les branches, pas de déclencheur `pull_request`) : jobs `changes`, `back` (tests), `back-checks` (migrations, code Wolverine, image de prod), `front`, `e2e` (4 jobs, specs réparties par `scripts/e2e-shard.mjs`), ces deux-là dans l'image `mcr.microsoft.com/playwright` à la version du lockfile (aucun `apt` ni téléchargement de navigateur), `nginx-headers`, agrégés par **« CI OK »**, seul check exigé par le ruleset (**tout nouveau job doit être ajouté à ses `needs`**) ; `deploy-staging` et `deploy` attendent « CI OK ». Une branche qui ne change que de la doc (`*.md`, `docs/`) par rapport à `env/staging` saute build et tests. SonarCloud en *Automatic Analysis* (exclusions posées dans l'UI, `sonar-project.properties` ignoré), Dependabot mensuel vers `env/staging`. Détail de chaque job, des durées, des exclusions Sonar et des groupes Dependabot : [`docs/exploitation/ci.md`](docs/exploitation/ci.md).

- **Toujours générer la migration EF** après une modif d'entité ou de configuration, et **régénérer le code Wolverine** après une modif de handler ou d'endpoint, sinon le job `back` casse.
- **Ne pas committer si le build front prod échoue** localement (`npm run build` doit passer), ni si `npm run lint:arch` échoue.
- **Tests E2E** : contre l'hôte de test (faux Deezer, faux email, `/api/e2e/reset`/`reseed`/`login-as-admin`…, cf. `src/back/CLAUDE.md` § Hôte de test).
- **Tests d'intégration** : Testcontainers (Docker fourni par `ubuntu-latest`), pas de `services:` YAML nécessaire.
- Si un job casse sur du formatage ou du lint, corriger en local avant de re-pusher : ne jamais désactiver le check.
- **Avertissements SonarCloud** : traités dans la même PR. Un fichier généré qui en produit s'exclut dans l'UI SonarCloud, pas dans `sonar-project.properties`.
- **Bumps Angular** : tous les `@angular/*` et `@ngrx/signals` dans la même PR (piège 15).

## Conventions .NET

- **Solutions au format `.slnx`** (jamais `.sln` classique). Créer avec `dotnet new sln --format slnx`
- **`global.json` avec `rollForward: latestFeature`** pour accepter tout SDK 10.0.x ; il fixe aussi le lanceur de tests Microsoft.Testing.Platform (`dotnet test --solution …`)
- Versions des paquets centralisées dans `Directory.Packages.props`, avertissements traités en erreurs (`Directory.Build.props`)
- Cibler `net10.0`, nullable + implicit usings activés

## Pièges connus

Les numéros sont stables : le code, les tests et les autres CLAUDE.md y font référence. Un piège devenu sans objet garde sa ligne, marquée **Retiré**, avec la raison. Le récit complet de chaque incident (dates, symptômes, premier correctif) est dans l'historique : `git show b38825d:CLAUDE.md`. Un piège qui concerne le code garde **un test nommé**.

1. **Retiré** - helper Visual Studio dans le conteneur de l'API : l'API ne tourne pas dans le compose de dev.
2. **Healthcheck PostgreSQL** - `pg_isready` dans le conteneur (`docker-compose.yml`, `deploy/infra`).
3. **Retiré** - polling de fichiers pour le hot-reload dans le conteneur Windows : l'API ne tourne pas dans `docker-compose.yml`.
4. **Retiré** - CORS à mettre à jour quand le port du front change : en dev et en E2E, le front passe par le proxy d'`ng serve` (même origine, aucune origine CORS). Les origines de confiance des fronts locaux sont dans `Auth:TrustedOrigins` de l'hôte de test (piège 22).
5. **Admin = rôle sur le compte, pas un mécanisme séparé** - un admin se connecte comme un joueur (lien magique). Le rôle est `players.accounts.is_admin`, posé **uniquement en SQL manuel** (cf. [`docs/exploitation/deploiement.md`](docs/exploitation/deploiement.md#commandes-utiles-vps)), jamais par le code. Il n'est pas écrit dans le cookie : `DeviceSessionValidator` le relit en base (cache d'une minute), la policy `Admin` protège tout `/api/admin*` et `/jobs`. Tests : `Security/SecurityTests` (401/403 de toutes les routes admin).
6. **Retiré** - `Results.Forbid()` sans `AddAuthentication()` : l'API enregistre l'authentification (cookie standard) et renvoie 401/403 sans redirection (`PlayerCookieEvents`).
7. **Cookie et same-site** - front et API sont same-site (`inseconds.cc` / `api.inseconds.cc`) : cookie `__Host-inseconds` en `SameSite=Lax; Secure; HttpOnly` en prod et staging, `inseconds` en `SameSite=Strict` sans `Secure` en dev et test (`AuthSetup`). Ne jamais repasser en `SameSite=None` (piège 23).
8. **Réglages lus en base au démarrage** - `DatabaseSettingsConfigurationProvider` n'ignore que « base, schéma ou table absents » (premier démarrage avant migration) ; toute autre erreur SQL empêche le démarrage. Les réglages sont rechargés juste après les migrations.
9. **E2E : `launchSettings.json` écrase l'environnement** - `dotnet run` sans `--no-launch-profile` impose `Development`. Toujours `--no-launch-profile` pour lancer l'hôte de test en `Testing` (`playwright.config.ts`, job CI `e2e`).
10. **E2E : ports** - hôte de test et front sur **5175/5176 en CI** (`ng serve --configuration e2e-ci`), **5177/5178 en local** (`--configuration e2e`). Ne pas confondre les deux ; l'extrait du faux Deezer pointe sur le front de test (`E2E_FRONT_PORT`).
11. **Tests d'intégration : Docker requis** - Testcontainers (`postgres:17-alpine`), un seul conteneur pour la suite, une base neuve par classe (copie d'une base modèle migrée une fois au début ; `CreateEmptyDatabaseAsync` pour les tests du premier démarrage). xUnit v3 : `IAsyncLifetime.DisposeAsync()` rend un `ValueTask`. Avec le SDK .NET 10, lancer `dotnet test --solution InSeconds.slnx` (lanceur Microsoft.Testing.Platform, `global.json`). `ApiFactory.DisposeAsync` vide les pools Npgsql, sinon la suite atteint la limite de connexions du serveur.
12. **Retiré** - cookie réutilisé d'un test à l'autre : chaque classe de tests a une base neuve, et `TestAuthHandler` simule un joueur par en-têtes quand le vrai cookie n'est pas l'objet du test.
13. **Jamais de `catch {}` nu côté Deezer** - `OperationCanceledException` n'est relancée que si l'annulation vient de l'appelant (un délai d'attente interne du `HttpClient` est un échec de Deezer, `Unavailable`), le reste est journalisé en `Warning` (`DeezerLog`). Tests : `UnitTests/Deezer/DeezerClientTests`.
14. **URL d'extrait Deezer signées et expirées** - l'URL porte `?hdnea=exp=…`, **valable 15 min** après sa délivrance (mesuré le 17/10/2026) : passé ce délai, le CDN la refuse. Aucun cache côté serveur (`IPreviewProvider` est le client brut, l'ancien `CachedPreviewProvider` et sa marge d'1 h ne gardaient jamais rien) : chaque démarrage de partie demande des adresses neuves. Côté front, un premier échec de lecture d'un morceau (joueur qui a pris plus de 15 min) redemande seul une adresse fraîche et relance, une seule fois ; un second échec affiche « Réessayer / Passer » (`recoverFromAudioError`, `refreshPreviewUrl`) ; une redemande qui revient sans extrait (morceau retiré par Deezer en cours de journée) passe la manche en « Aperçu non disponible » au lieu de relancer l'adresse morte. Chaque échec de lecture est remonté (`AudioError`, sans l'adresse), sauf celui d'une adresse à la signature déjà expirée (`isSignatureExpired`), attendu et relancé seul. Préchauffer un cache est impossible avec 15 min (#279, fermé). Tests : `UnitTests/Deezer/DeezerCacheTests`, `track-round.store.spec.ts`, E2E `audio-error.spec.ts`.
15. **Bumps Angular partiels = `npm ci` cassé** - les `@angular/*` (y compris `cli`, `compiler-cli`, `build`) exigent la même version exacte, `@ngrx/signals` suit ; Dependabot les groupe (`angular`). Toujours tout aligner dans la même PR.
16. **Erreurs Deezer en HTTP 200** - quota (4), service occupé (700), morceau supprimé (800) arrivent en `200 OK` avec `{"error":…}`, hors de la résilience HTTP. Seul **800** est une réponse déterminée (`Missing` / `NotFound`) ; tout le reste donne `Unavailable`, qui **ne change jamais** `preview_status` (`Track.RecordPreviewCheck`). `catalogue-refresh` espace ses lots (10 morceaux / 1,5 s) et ne tourne pas en staging (même IP que la prod, même quota). Un run ne neutralise un morceau que sur une absence déterminée, jamais sur `Unavailable` (`ITrackPreviews.GetAsync`). Tests : `DeezerClientTests`, `UnitTests/Catalogue/TrackTests`, `RefreshPreviewsTests`, `Jobs/ScheduledJobsTests`, `Runs/RunPlayTests`.
17. **Clés Data Protection : en base, chiffrées par certificat** - sans clés persistées, chaque redéploiement rendait les cookies illisibles (tous les joueurs perdaient leur identité). Elles sont dans `infra.data_protection_keys`, chiffrées par le certificat `secrets/dataprotection.pfx` (exigé en prod et staging, `DataProtectionSetup`) ; une clé neuve est créée après chaque copie de base (`--rotate-data-protection-key`, sinon une clé copiée chiffrerait les nouveaux cookies). Tests : `Security/DataProtectionTests`.
18. **Série : toujours comparer sur la date du défi, jamais sur l'heure de complétion** - terminer le défi de la veille après minuit ne casse pas la série ; les jours manqués se comptent sur les dates des défis. `DailyStreak.RecordCompletion(date du défi, …)`. Corollaire : la veille reste jouable après minuit, ses stats ne sont figées qu'à J-2 (`daily-close-day`), et une partie d'un défi plus vieux que la veille est refusée (409 `daily.abandoned`). Tests : `Daily/StreakTests`, `PlaySessionTests`, `DayStatsSnapshotTests`.
19. **Retiré** - `Task.Delay(~24 h)` qui se réveillait avant minuit et sautait un jour : les tâches de nuit passent par Hangfire, qui planifie sur l'horloge murale.
20. **`Cache-Control` nginx** - bundles hashés en `public, max-age=31536000, immutable`, tout le reste (`index.html`, `i18n/*.json`, fichiers du service worker, `manifest.webmanifest`) en `no-cache` ; sinon un navigateur garde de vieilles traductions après un déploiement. nginx n'hérite pas des `add_header` du niveau `server` dans une `location` qui a les siens : les en-têtes de sécurité sont inclus dans chaque `location` (`security-headers.conf`). Vérifié par le job CI `nginx-headers`, seul à servir l'image de prod.
21. **Scanners de liens dans les emails** - Safe Links et certains antivirus ouvrent les liens d'un email avant l'humain. Le lien magique et le lien de changement d'email ne se consomment **jamais** à l'ouverture de la page, seulement au clic sur « Confirmer ». Tests : `Players/MagicLinkTests`, specs `verify` / `confirm-email` du front.
22. **Origine de confiance sur la vérification du lien magique** - seul `POST` public qui pose un cookie à partir d'un secret : `TrustedOrigins` exige `Origin` (ou l'autorité exacte du `Referer`) dans `Cors:AllowedOrigins` + `Auth:TrustedOrigins`. Un port de front oublié dans `Auth:TrustedOrigins` de l'hôte de test casse silencieusement les E2E sur ce port. Ne s'applique pas à la confirmation d'un changement d'email (aucun cookie posé) ni aux routes admin. Tests : `MagicLinkTests`, `UnitTests/Players/TrustedOriginsTests`.
23. **Jamais `SameSite=None` sur le cookie** - les navigateurs (Safari ITP surtout) purgent ces cookies bien avant leur durée nominale : déconnexions quasi quotidiennes en 2026-09. `Lax` suffit, rien n'étant cross-site (cf. piège 7, `AuthSetup`).
24. **Mémoire : Workstation GC et caches dédiés** - Server GC (défaut du SDK Web) retient la mémoire dans un conteneur contraint : `ServerGarbageCollection=false` et `ConcurrentGarbageCollection=false` dans `InSeconds.Api.csproj`. Tout `MemoryCache` avec `SizeLimit` exige une `Size` sur chaque `Set` (exception sinon) ; l'API utilise des caches dédiés (`DeezerCache`, `DeviceSessionStatusCache`), jamais l'`IMemoryCache` partagé. Tests : `DeezerCacheTests`.
25. **Cache Docker et horodatage du build** - une commande non déterministe dans un `RUN` n'est pas rejouée si les couches d'avant n'ont pas changé : l'heure de déploiement de l'admin restait figée. `deploy.sh` exporte `BUILD_TIME` à chaque déploiement, passé en argument de build au front (`ng build --define BUILD_TIME`), ce qui invalide la couche.
26. **`caddy reload` ne suffit pas après un `git reset --hard` sur le Caddyfile** - le fichier est monté seul en bind mount, lié à l'inode d'origine ; git remplace le fichier (nouvel inode) et Caddy relit l'ancien (`config is unchanged`). Faire `docker restart caddy` (certificats conservés dans leurs volumes).
27. **`X-Forwarded-For` derrière Cloudflare puis Caddy** - deux sauts à dérouler, sinon le rate limiting compte l'IP d'un edge Cloudflare (des milliers de visiteurs dans le même compartiment). `TrustedProxyNetworks` (`InSeconds.Infrastructure/Networking`) fait confiance aux plages privées (Caddy) et aux plages Cloudflare, avec `ForwardLimit = null` ; une IP hors de ces plages arrête le déroulement (pas d'usurpation). Tests : `Security/ForwardedHeadersAndRateLimitingTests`.
28. **Filtre texte sur plusieurs champs** - une recherche « Artiste Titre » ne correspond à aucun des deux champs pris seul : le filtre du pool admin teste aussi `artist + ' ' + title` (`admin/domain/pool-filters.ts`). Vaut pour tout futur filtre multi-champs.
29. **État `[LoggerMessage]` recyclé après l'appel** - un logger de test qui garde la référence de `state` la voit vidée : copier les propriétés au moment de l'appel (`UnitTests/Support/CapturingLogger`).
30. **Lien magique ouvert dans un navigateur déjà connecté** - un compte déjà lié n'est **jamais** converti : l'adresse sans compte obtient un nouveau joueur, le compte d'origine reste intact (sinon un tiers récupérait le compte d'une victime). `AccountSignIn` ; le front prévient avant de confirmer. Tests : `Players/MagicLinkTests`.
31. **Rien qui identifie un morceau avant la réponse** - ni artiste, ni titre, ni année, ni identifiant Deezer dans `POST /api/daily/sessions` ; `GET /api/daily/stats/today` ne remplit `tracks` que pour un joueur dont la partie est finie. Pochette et lien Deezer n'arrivent qu'avec la réponse. Tests : `Daily/TodayStatsTests`, `StartSessionTests`, E2E `answers-hidden.spec.ts`.
32. **Réponse perdue sur coupure réseau** - `DailyApi.submitAnswer` réessaie 2 fois une coupure ou un 5xx (jamais un 4xx) ; un échec définitif remet la manche en « Réessayer » sans rien enregistrer ni afficher de faux résultat. Sinon la partie restait en cours et finissait expirée.
33. **Échec de lecture = état `error`, jamais `idle`** - un retour à `idle` relançait l'écoute automatique en boucle (round bloqué, requêtes en rafale vers le CDN). L'`AudioPort` passe en `error`, la manche montre « Réessayer / Passer ». Tests : `round-player.component.spec.ts`, E2E `audio-error.spec.ts`.
34. **`trusted_proxies` dans le Caddyfile** - sans lui, Caddy remplace `X-Forwarded-For` par l'IP du edge Cloudflare. Bloc global `servers { trusted_proxies cloudflare {…} }`, module `caddy-cloudflare-ip` dans l'image Caddy (`deploy/caddy/Dockerfile`). Rebuild manuel de Caddy (jamais par la CI).
35. **Verrou du morceau en cours et plancher d'écoute** - le morceau en cours est le premier sans réponse ; un autre morceau ne prend pas le verrou (409 `daily.track_lock_not_released`), sinon on contournait la pénalité d'indice ou le plancher. `TrackRound.Listen` garde le maximum écouté, `Answer` refuse un palier annoncé sous ce plancher (400 `daily.listened_duration_below_verified_minimum`), le niveau d'indice vient de la session, jamais du client. Tests : `Daily/PlaySessionTests`, `UnitTests/Gameplay`.
36. **Jamais le texte d'une recherche dans les journaux** - seulement sa longueur (`DeezerLog`, `QueryLength`). Le tag `url.query` du span serveur est absent ou masqué. Tests : `Catalogue/SearchTelemetryTests`, `DeezerClientTests`.
37. **Une erreur de base ne déconnecte jamais** - si la validation de l'appareil (`DeviceSessionValidator`) ou la reprise des anciens cookies n'arrivent pas à lire la base, la requête échoue en 500 ; seul un cookie réellement invalide ou révoqué est rejeté (créer un nouvel invité sur une panne passagère ferait perdre son identité au joueur). Tests : `Players/CookieValidationTests`, `LegacyCookieTests`.
38. **Fin de partie sur le nombre réel de morceaux du défi** - jamais sur le réglage `TracksPerChallenge`, qui peut avoir changé depuis la génération (`DailySession.Answer`). Tests : `Daily/PlaySessionTests`.
39. **Déconnexion = cet appareil seulement** - `POST /api/players/auth/logout` révoque la session d'appareil courante, les autres appareils restent connectés ; « déconnecter les autres appareils » est une action à part (et supprime aussi l'ancien jeton `legacy_tokens` du joueur). Un jeton partagé par tous les appareils, qu'on fait tourner, déconnecterait tout le monde (incident du 2026-09-30). Tests : `Players/DevicesTests`.
40. **« Écouter plus » et relecture** - « écouter plus » pendant la lecture repousse l'arrêt sans couper ; à l'arrêt, il relit depuis 0 jusqu'au nouveau palier ; la relecture (↺) ne remet pas `wasExtended` à faux. `HtmlAudioPort`, tests `html-audio.port.spec.ts` (vrais sons dans Chromium, lancé avec `--autoplay-policy=no-user-gesture-required`).
41. **Statistiques du jour en échec** - un échec de `stats/today` met les stats à `null` et l'écran s'affiche sans, sans remonter l'erreur deux fois (`DailyGameStore`).
42. **Réponse Deezer tardive dans la fenêtre d'écoute** - fermer la fenêtre d'écoute (pool de l'admin, page d'un jour passé) arrête le son, et une adresse d'extrait arrivée après la fermeture (ou après l'ouverture d'un autre morceau) ne relance rien. Tests : `core/audio-preview/preview-track.dialog.spec.ts`.
43. **Déploiement par la CI** - clé d'hôte SSH épinglée (secret `VPS_SSH_HOST_KEY`, sinon `ssh-keyscan` avec avertissement), `docker image prune -f` (jamais `-a` : d'autres projets partagent le VPS), groupe de concurrency propre au déploiement (`cancel-in-progress: false`, un déploiement n'est jamais coupé en plein rebuild), vérification de santé après déploiement. Tout est dans `deploy/vps/deploy.sh` et l'action `.github/actions/vps-ssh`. Piste non appliquée : restreindre la clé de déploiement par `command=` dans `authorized_keys`.
44. **Arrêt du palier calé sur le son réel** - un chrono lancé à l'appel de `play()` coupait le son trop tôt sur mobile (le son sort parfois plusieurs centaines de millisecondes plus tard) : le chrono part à l'événement `playing` pour `palier − currentTime`, il est suspendu sur `waiting`, et une boucle `requestAnimationFrame` coupe dès que `currentTime` atteint le palier (`HtmlAudioPort`, tests `html-audio.port.spec.ts`). (#309). Autre règle : **l'écoute automatique n'a lieu qu'une fois par morceau** (`autoStarted`, `gameplay/domain/track-round.ts`), sinon un retour au repos ramenait le joueur au premier palier.
45. **Copie presse-papier intermittente** - `navigator.clipboard.writeText` peut rejeter même dans un vrai clic (« Document is not focused ») : repli sur une copie par textarea + `execCommand('copy')`, rejet remonté sans jamais le texte copié (`core/clipboard/ClipboardService`). E2E `share-button.spec.ts`.
46. **Faux événement `playing` de Safari** - sur iPhone, `playing` part dès l'appel à `play()` alors que le son ne démarre que bien plus tard (relecture ↺ surtout) : un chrono fixe coupait le palier avant presque tout son. Le chrono ne coupe jamais à l'aveugle : à l'échéance, il relit `currentTime` et se reprogramme si le palier n'est pas atteint, et rien ne coupe pendant un `seeking` (Safari renvoie l'ancienne position juste après `currentTime = 0`). `HtmlAudioPort`, tests `html-audio.port.spec.ts` (démarrage lent, faux `playing`). (#309).
47. **Conditions de l'API Deezer** - usage **strictement non commercial** (ni revenu, ni publicité, ni partenaire), extraits de 30 s seulement, **aucun audio ni aucune image Deezer stockés** (ni dans un cache persistant du navigateur, service worker compris : `ngsw-config.json` n'a aucun `dataGroups`, ni dans une image générée comme les stories) ; seules les métadonnées sont gardées (artiste, titre, année, rang, album et genres de l'album, hash de pochette). La page `/privacy` mentionne l'usage privé et les CDN Deezer qui voient l'IP du joueur. Synthèse : [`docs/conformite/conditions-api-deezer.md`](docs/conformite/conditions-api-deezer.md).
48. **Effacement d'un joueur complet** - `AccountErasure` (bouton du profil, purge des comptes inactifs, `--delete-player`) supprime d'abord ses données de jeu (contrat `Players.Contracts.IPlayerDataContributor`, que chaque mode de jeu implémente), puis tout ce que Players garde de lui, ligne `players.players` comprise : une table qui référence un joueur et que l'effacement oublie bloquerait la suppression (clé étrangère) ou garderait ses données. **Toute nouvelle table avec une colonne `player_id` doit y être ajoutée.** Les jetons de connexion ne portent que l'adresse : ceux de son email partent aussi. Tests : `Players/PlayerDataTests` (lit toutes les colonnes `player_id` dans `information_schema`), `PlayersPurgeTests`, `PlayerDataCommandTests`.
49. **Le service worker garde la CSP de son installation** - un service worker applique à ses propres requêtes la CSP reçue avec son script (`connect-src`), et le navigateur ne le réinstalle que si ce script change : installé sous une CSP bloquante qui n'autorisait pas le CDN de Deezer en `connect-src`, il répondait 504 à chaque extrait, même après le retour de la CSP en observation (incident du 2026-10-19, joueurs sur Chrome, Edge, Brave). Toute origine tierce lue par la page (extraits, pochettes, Google Fonts) doit donc aussi être en `connect-src`, et `Dockerfile.prod` ajoute l'empreinte de la CSP à la fin de `ngsw-worker.js`, qui se réinstalle quand elle change. Le nouveau worker ne prend la main qu'en cours de visite : `VersionService` recharge la page à ce moment-là (`controllerchange`, au premier moment sûr), sinon la première partie après la mise à jour passait encore par l'ancien. Vérifié par `scripts/check-nginx-headers.sh` (job CI `nginx-headers`) et `version.service.spec.ts`.

## Ce que fait l'application

Vue fonctionnelle ; le détail technique de chaque point est dans `src/back/CLAUDE.md` et `src/front/CLAUDE.md`, les règles du jeu dans [`docs/regles-du-jeu.md`](docs/regles-du-jeu.md).

- **Jeu du jour** (`/daily`) : accueil centré (la date, « Blind test du jour », « 5 morceaux à deviner », puis « Ton record » du joueur en orange, sinon « Score à battre » : la médiane d'hier à partir de 5 parties, en violet, jamais le meilleur score du jour ; « Commencer », le relevé de série, « Créer un compte » pour un invité, et en bas le lien « Réponses des jours passés »), reprise d'une partie en cours (même mise en page : date, « Partie en pause », « 2 morceaux sur 5 déjà joués », Reprendre, Abandonner, relevé de série), manche (écoute par paliers, « écouter plus », indices année puis artiste masqué, autocomplétion Deezer, « Passer (0 pts) »), révélation avec l'histogramme « en combien de temps les autres ont trouvé », un seul écran « résultat du jour » juste après la partie comme aux visites suivantes (score avec la partie en petites barres et compte à rebours, une seule phrase dessous : le moment fort de la partie, sinon « mieux que X % », égaliseur des scores du jour, les morceaux repliés, « Partager mon score » et le relevé de série dessous, réponses d'hier ; l'abandon a son écran), partage du score (✅ / 🔶 / 🅾️ par morceau, menu de partage du téléphone sur écran tactile, sinon presse-papier). Le son ne démarre que sur un clic (iPhone). Confirmation avant de quitter une partie en cours, synchronisation entre onglets.
- **Réponses des jours passés** (`/daily/archive/aaaa-mm-jj`, #407) : publiées dès le lendemain (la veille en direct, J-2 et avant depuis la photo figée), jamais le jour même ; morceaux, égaliseur, par morceau la part des joueurs qui ont trouvé l'artiste, le titre, et à quel palier, **en pourcentages seulement, rien sous 5 joueurs** ; un joueur reconnu par son cookie voit en plus ses ✓/✗ et ses points ; artiste et titre sur une ligne (en entier au toucher), « Écouter l'extrait » dans la fenêtre d'écoute de l'admin. Accès par le lien en bas de l'accueil ; flèches ‹ › (vrais liens), calendrier, encart « Les réponses d'hier » sur « déjà joué », `sitemap.xml` servi par l'API (route Caddy).
- **Identité** : invité créé au premier « Commencer » (la lecture de l'état du jour ne crée rien), avec sa source d'arrivée (`utm_source` du lien, comme `instagram` en bio ou `share` des liens partagés, sinon le domaine du site d'origine, sinon `direct` ; #445) ; compte optionnel par lien magique (inscription ouverte, pas de mot de passe ; correction proposée d'un domaine mal tapé, adresse rappelée après l'envoi avec « Renvoyer le lien », étape « Nouveau compte » avec l'adresse et « J'ai déjà un compte » avant de créer un compte, sans jamais dire à la saisie si une adresse a un compte), pseudo, changement d'email confirmé à la nouvelle adresse, liste des appareils connectés (repliée dans le profil), déconnexion d'un appareil ou de tous les autres. Droits RGPD, section « Tes données » du profil : « Télécharger mes données » (copie de toutes ses données en JSON, `GET /api/players/me/export`) et « Supprimer mon compte » (fenêtre où l'on retape son pseudo, `POST /api/players/me/delete`) ; commandes de secours `--export-player` / `--delete-player` sur le VPS. Durées de conservation appliquées chaque nuit : appareils sans visite depuis 91 jours, comptes inactifs depuis 3 ans. Les anciens cookies (`authToken`) sont repris à la première visite (une session d'appareil par conversion).
- **Série et gels** : série sur la date du défi, gels pour les comptes (1 offert à la création, +1 tous les 7 jours, 2 au plus), série protégée ou perdue, relevé « 🔥 jours · ❄ gels » sous « Commencer », sous « Reprendre » et sous « Partager mon score », ligne cyan « Un gel a protégé ta série hier. » sur l'accueil d'une série protégée, panneau de détail, toasts de fin de partie. La page de connexion s'appelle « Connexion ou inscription » (un seul parcours).
- **Platines** (`/runs`, mode Run sur invitation) : accueil du mode et record, reprise d'une partie en cours, manches de 5 morceaux à écoute fixe (bloc objectif, pastilles, réponse après chaque morceau), morceau retiré quand Deezer n'a plus d'extrait (objectif abaissé), bilan après chaque manche, fin avec le disque obtenu, le record et « Partager la playlist » et « Voir les autres joueurs » ; carte Platines sous l'accueil et « déjà joué » pour un compte qui a l'accès. **Lien d'un ami** (`/runs/<code>`, sans accès sur invitation : il suffit d'avoir le lien, invité compris) : écran « lien reçu » (logo, règles de la playlist, « Jouer » qui crée l'invité et lance le premier son), reprise d'une partie en cours, ou **comparaison** des joueurs de la playlist (pseudo ou « Invité », disque, score de chaque manche, total, « Toi » surligné) pour qui l'a déjà jouée ; une playlist se joue une seule fois, la comparaison ne s'ouvre qu'après la fin de sa propre partie ([`docs/runs/`](docs/runs/README.md)).
- **Admin** (`/admin`, rôle `is_admin`, cadenas dans l'en-tête du jeu) : tableau de bord, défis (stats par défi, chips joueur « toi », histogrammes, recalcul d'une photo figée), pool (recherche et ajout Deezer, écoute, renommage à tout moment, désactivation, suppression d'un morceau jamais utilisé, cooldown appliqué coloré selon le seuil de 14 jours), joueurs (comptes, série, historique de 30 jours, interrupteur d'accès au mode Run), actions (témoins des tâches planifiées, part du pool en cooldown et jours appliqués, stories Instagram hebdomadaires), lien vers `/jobs`, heure de déploiement.
- **Transverse** : FR/EN (détection puis choix dans le pied de page), pied de page en texte sur deux lignes (mentions légales, confidentialité, contact ; Instagram, FR / EN), PWA installable, nouvelle version appliquée d'elle-même à un moment sûr (jamais pendant une manche, une saisie ou une fenêtre ouverte ; bandeau « Nouvelle version disponible » seulement en secours), overlay « Service indisponible » (sonde `/health`), code d'erreur affiché au joueur (le `traceId`), pages `/legal` et `/privacy`, avis « l'adresse a changé » pour l'ancienne URL `code.run`, CSP du front (en observation, `report-only`, le temps d'écarter la CSP des échecs de lecture d'extraits sur Android ; #300 ; violations envoyées par le navigateur à `POST /api/csp-reports` dès le chargement de la page, tuile Grafana « Violations CSP »).
- **Observabilité** : OpenTelemetry (logs, traces, métriques) exporté en OTLP vers Grafana Cloud si `OTEL_EXPORTER_OTLP_ENDPOINT` est défini, **en prod seulement** (le staging ne transmet aucune variable `OTEL_*`) ; compteurs métier des parties, réponses, invités créés par source d'arrivée, connexions et comptes effacés (`DailyMetrics`, `PlayersMetrics`, `RunsMetrics`) pour le tableau « Activité », trois tableaux dans `deploy/grafana/` (Exploitation, Un joueur, Activité) ; tag `inseconds.player_id` et scope `PlayerId` sur chaque requête identifiée, pour suivre le parcours d'un joueur. **Jamais d'email, de pseudo, de réponse saisie, de cookie ni d'`Authorization` dans la télémétrie** (testé). Logs SQL d'EF Core coupés en prod, au staging et dans l'hôte de test (`Database.Command` en `Warning`) ; une écriture refusée par la base est journalisée en `Warning`, la panne réelle en `Error` par le gestionnaire global. Une erreur remontée par le front porte la version du front, l'état de la connexion et l'appareil (« Safari · iPhone », jamais le `User-Agent` brut). Fréquentation du site (visiteurs qui ne jouent pas compris) : Cloudflare Web Analytics, sans cookie, activé dans le tableau de bord Cloudflare (injection automatique) et déclaré dans la CSP et `/privacy` ; jamais Google Analytics (bandeau de consentement, cf. `docs/conformite/rgpd.md`).

## À venir

- **Fin de la reprise des anciens cookies** (#237, vers le 14/01/2027) : `legacy_tokens`, `LegacyCookieTransitionMiddleware` et anciennes clés Data Protection non chiffrées.
- **Recette iPhone** : lire les diagnostics `Viewport:` et `AudioStall:` remontés par le front, puis les retirer (`src/front/CLAUDE.md` § Erreurs).
- **Mode Runs** (« Platines » à l'écran, « Run » dans les tickets, epic #368) : **le proto 1 est livré (27/10/2026), sur invitation** : module `Runs` (schéma `runs`, défi et tirage par difficulté, réglages `Runs:`, accès avec son interrupteur dans l'onglet Joueurs de l'admin), routes de la partie et de la comparaison, domaine front `runs/` (accueil, reprise, manche, réponse, morceau retiré, bilan, fin, lien d'un ami, comparaison, carte sur l'accueil du jeu du jour), E2E (`runs.spec.ts`). Reste : les parties de test et le réglage des seuils, quelques suites ([`docs/taches.md`](docs/taches.md)), puis le proto 2 (bonus). Règles, écrans de référence, conception et feuille de route : [`docs/runs/`](docs/runs/README.md).
- Le reste : [`docs/taches.md`](docs/taches.md).

## Décisions d'architecture

Les choix déjà faits et leur raison (pas de leaderboard permanent, pas de mot de passe, monolithe modulaire, Wolverine, Hangfire, NgRx SignalStore, élément audio HTML, bibliothèques éprouvées plutôt que du code maison…) : [`docs/architecture/decisions.md`](docs/architecture/decisions.md). **À lire avant de proposer une nouvelle fonctionnalité**, pour ne pas rediscuter ni réimplémenter une décision prise.

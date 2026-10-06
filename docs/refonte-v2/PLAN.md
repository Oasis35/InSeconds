# InSeconds v2 : plan détaillé de la refonte complète

- **Date :** 30/09/2026
- **Statut :** plan de travail. **Aucun code n'est écrit, et rien ne démarre sans le go explicite de Clément.**
- **Ce document regroupe tout :** le modèle de données, le back, le front, le mode Runs, le plan de développement, la reprise des données et la bascule. Il remplace, comme référence, les documents du 29/09 (`plan-refonte-complete`, `refonte-back`, `refonte-back-solid`, `refonte-modele-donnees-et-front`, `refonte-front`), qui restent disponibles pour l'historique de la réflexion.
- **Base :** code de `env/staging` au 30/09/2026, fil « Refonte globale du back », fil « Nouveau mode de jeu » (Runs), fil « Store Angular pertinent ? ».

## Sommaire

1. Objectifs et périmètre
2. Décisions prises
3. Architecture d'ensemble
4. Modèle de données
5. Back
6. Front
7. Mode Runs
8. Reprise des données existantes
9. Plan de développement
10. Staging, bascule en prod et retour arrière
11. Documentation, exploitation et nettoyage
12. Risques et parades
12 bis. Sécurité
12 ter. Relecture complète
13. Points encore ouverts

---

## 1. Objectifs et périmètre

### 1.1 Ce qu'on vise

La v2 d'InSeconds est reconstruite de zéro, du modèle de données jusqu'au front, et doit :

1. **rejouer à l'identique le défi du jour :** mêmes règles, même interface, mêmes textes pour le joueur ;
2. **accueillir le mode Runs sans toucher au défi du jour :** c'est Runs qui s'adapte à l'architecture si besoin ;
3. **respecter SOLID sans exception**, côté back comme côté front ;
4. **reprendre toutes les données utiles de la prod,** sans rien perdre ni déconnecter personne, avec une bascule répétée sur le staging avant la prod ;
5. **garder les mêmes adresses publiques :** `inseconds.cc` et `api.inseconds.cc`.

### 1.2 Ce qu'on garde

| Domaine | Choix gardé |
|---|---|
| Back | .NET 10, Wolverine, EF Core, FluentValidation, PostgreSQL 17 |
| Front | Angular 22 zoneless et signals, Tailwind v4 et tokens de la DA, ngx-translate, NSwag, Vitest, Playwright |
| Auth | magic link par email, sans mot de passe, cookie HttpOnly chiffré par Data Protection (en v2 : cookie d'authentification standard d'ASP.NET Core, § 5.5) |
| Emails | Brevo, avec redirection sur le staging |
| Observabilité | OpenTelemetry vers Grafana Cloud, avec les mêmes règles de confidentialité |
| Hébergement | VPS OVH, Docker Compose, Caddy, Cloudflare, Postgres partagé |
| Livraison | PR vers `env/staging`, validation sur le staging, puis merge dans `main` |

### 1.3 Ce qui est hors périmètre de la bascule

- Le mode Runs lui-même : l'architecture lui laisse sa place, mais **rien de Runs n'est créé à la bascule** : ni tables, ni schéma, ni dossier de code, ni routes (décision de Clément, 30/09). Tout est créé quand le mode sera construit, par une migration EF classique, sans reprise de données.
- Les stats hebdo (stories Instagram) : fonctionnement inchangé, simplement déplacées dans le module Daily.
- Le leaderboard : toujours écarté.

### 1.4 Avis honnête sur l'ampleur

C'est la réécriture de quasiment tout le code. Elle se justifie parce que Runs arrive et que le modèle actuel ne l'accueillerait qu'avec des `if (mode == …)` partout. Si Runs était abandonné, la refonte progressive du 29/09 (note de travail du 29/09, hors dépôt) suffirait.

---

## 2. Décisions prises

| Sujet | Décision | Date |
|---|---|---|
| Médiateur | garder **Wolverine** et bien l'utiliser : Wolverine.Http, codegen statique, transactions auto, outbox PostgreSQL (les tâches récurrentes passent par Hangfire, voir plus bas) | 29/09 |
| File de messages | pas de RabbitMQ, l'outbox PostgreSQL suffit | 29/09 |
| Base | PostgreSQL définitif | 29/09 |
| Persistance | **un store par module** (`IDailyStore`…), nommé par l'intention ; pas de repository générique | 29/09 |
| Nommage en base | **snake_case** | 29/09 |
| Joueurs | **tous repris**, supprimés compris | 29/09 |
| Stats admin | stats du jour **figées** à la clôture, bouton de recalcul ; stats hebdo inchangées | 29/09 |
| Projets transverses | `InSeconds.Infrastructure` (nom choisi par Clément) et `InSeconds.Api.Testing` | 29/09 |
| Nouveau mode | Runs s'adapte à l'architecture | 29/09 |
| Adresses | `inseconds.cc` et `api.inseconds.cc` inchangées, pas de sous-domaine `api-v2` | 30/09 |
| Authentification | **cookie standard d'ASP.NET Core** avec validation de l'appareil en base, plutôt qu'un schéma maison | 30/09 |
| Base de données | **même base** (`inseconds`, `inseconds_staging`), v2 dans de nouveaux schémas à côté de `public` ; tables v1 jamais modifiées, supprimées après la bascule | 30/09 |
| Organisation du chantier | **v1 et v2 côte à côte** : v2 dans `src/v2/back` et `src/v2/front`, petites PR vers `env/staging` ; après la bascule, suppression de la v1 et déplacement de la v2 dans `src/back` et `src/front` | 30/09 |
| Tâches planifiées | **Hangfire** (stockage PostgreSQL, tableau de bord `/jobs` réservé aux admins) qui déclenche des commandes Wolverine ; cron dans la configuration ; principe général : **solutions existantes plutôt que code maison** | 30/09 |
| Clés Data Protection | **chiffrées avec un certificat** (`ProtectKeysWithCertificate`), certificat hors de la base et sauvegardé à part | 30/09 |
| Stores front | **NgRx SignalStore** (`@ngrx/signals`) ; NgRx Store classique écarté | 30/09 |
| Runs à la bascule | **rien de créé** : ni tables vides, ni schéma, ni code ; tout arrive avec la construction du mode | 30/09 |

---

## 3. Architecture d'ensemble

### 3.1 Le principe

Le jeu est un ensemble de **modes** branchés sur des **noyaux** communs. C'est un **monolithe modulaire** : chaque module est organisé à la manière hexagonale (domaine au centre, adaptateurs autour), avec des vertical slices et du CQRS léger. Les modules communiquent par des événements Wolverine et par leurs `Contracts/`.

| Niveau | Modules | Rôle |
|---|---|---|
| Noyaux | `Players` | identité, compte, appareils, magic link, rôle admin |
| | `Catalogue` | morceaux et leurs métadonnées (année, rang, genre), previews, pool admin |
| | `Gameplay` | mécanique d'un morceau (écouter, indice, répondre, corriger), tirage avec graine |
| Modes | `Daily` | défi du jour : paliers, indices, série et gels, stats figées, stories hebdo |
| | `Runs` (plus tard) | nouveau mode : manches, difficulté, bonus, thèmes, record, fantôme ; pas créé à la bascule |
| Composition | `InSeconds.Api` | routes, authentification, politiques, injection de dépendances |
| Adaptateurs | `InSeconds.Api/Infrastructure`, `InSeconds.Deezer`, `InSeconds.Infrastructure` | EF, cookie, settings, Deezer, emails, OpenTelemetry, réseau, rate limiting |

### 3.2 Schéma

```
                 ┌──────────────────── FRONT Angular ────────────────────┐
                 │ daily/   account/   admin/   (runs/ et home/ plus tard) │
                 │ gameplay/ (manche partagée)   ui/ (kit DA)   core/    │
                 │ api/ : un client NSwag par module                     │
                 └───────────────────────────┬───────────────────────────┘
                                             │ HTTPS api.inseconds.cc  /api/{module}/…
                                             │ erreurs : ProblemDetails + code stable + traceId
┌─────────────────────────────────── BACK .NET ───────────────────────────────────┐
│ InSeconds.Api (composition)                                                      │
│                                                                                  │
│   MODES        Daily ──── ✕ ──── (Runs, plus tard)   un mode ne dépend jamais d'un autre │
│                  │                 │                                             │
│   NOYAUX       Gameplay ──► Catalogue      Players                               │
│                                                                                  │
│   ADAPTATEURS  EF Core · cookie · settings │ InSeconds.Deezer │ InSeconds.Infrastructure │
└───────────────────────────────────────┬──────────────────────────────────────────┘
                                        │
     PostgreSQL inseconds (base actuelle) : players · catalogue · daily · infra · messaging · jobs   (runs plus tard)
     tables v1 laissées intactes dans public, supprimées quelques semaines après la bascule
```

### 3.3 Règles de dépendance, vérifiées en CI

- **Back** (tests d'architecture, ArchUnitNET ou NetArchTest) :
  - un mode dépend des noyaux, jamais d'un autre mode ;
  - `Gameplay` ne dépend que de `Catalogue/Contracts` ;
  - un module n'utilise d'un autre module que son dossier `Contracts/` ;
  - `Domain/` ne référence ni EF Core, ni ASP.NET Core, ni `DateTime.UtcNow` ;
  - rien dans `InSeconds.Api` ne référence `InSeconds.Api.Testing`.
- **Front** (Sheriff) :
  - `daily` et `runs` ne s'importent jamais mutuellement ;
  - `gameplay` ne connaît aucun mode ;
  - seule la couche `data-access` importe `api/` ;
  - `domain/` n'importe rien d'Angular.

---

## 4. Modèle de données

### 4.1 Principes

- **Même base, nouveaux schémas** (décision du 30/09) : la v2 vit dans la base actuelle `inseconds` (et `inseconds_staging` sur le staging), dans les schémas `players`, `catalogue`, `daily`, `infra`, `messaging` (Wolverine) et `jobs` (Hangfire). Les tables v1 restent **intactes** dans `public` jusqu'au nettoyage : le retour arrière consiste à redémarrer la v1. Pas de nouvelle base, pas de nouvel utilisateur, pas de nouvelle chaîne de connexion, sauvegardes inchangées.
- **Historique des migrations EF séparé :** la v2 utilise `infra.__ef_migrations_history` (`MigrationsHistoryTable`), la v1 garde `public."__EFMigrationsHistory"`. Le `DbContext` v2 ne mappe aucune table de `public`, et un test d'architecture le vérifie.
- **Un schéma PostgreSQL par module** et un seul `DbContext`. Les clés étrangères entre schémas restent déclarées en base.
- **snake_case** via `EFCore.NamingConventions`.
- **Extension `citext`** pour l'email et le pseudo : l'unicité insensible à la casse est garantie par la base.
- **Une seule migration EF initiale,** au lieu des 47 d'aujourd'hui.
- **Pas de navigation EF entre modules :** seulement des identifiants (`player_id`, `track_id`).
- **On ne stocke que ce qui ne se déduit pas,** sauf pour une photo volontairement figée (`challenge_day_stats`).
- **Identifiants conservés à l'import.** `uuid` pour les joueurs, `int` identity ailleurs ; un `uuid` public pour ce qui se partagera (runs, plus tard).
- **Horodatages en `timestamptz`, dates de jeu en `date`.**

### 4.2 Schéma `players`

| Table | Colonnes | Contraintes et remarques |
|---|---|---|
| `players` | `id uuid PK`, `created_at timestamptz`, `last_seen_at timestamptz null`, `deleted_at timestamptz null` | un invité est un joueur **sans** ligne `accounts` : plus de `is_guest` ni de contrainte « invité ⇔ pas de pseudo » |
| `accounts` | `player_id uuid PK FK players`, `email citext UNIQUE`, `pseudo citext UNIQUE`, `is_admin bool default false`, `linked_at timestamptz null` | `linked_at` est `null` pour les comptes repris (date inconnue) |
| `device_sessions` | `id int PK`, `player_id uuid FK`, `created_at`, `last_seen_at`, `revoked_at null`, `user_agent_label text null` | une ligne par appareil connecté ; le cookie standard porte l'`id` et la validation vérifie `revoked_at` ; index sur `player_id` |
| `legacy_tokens` | `player_id uuid PK FK`, `token_hash bytea UNIQUE` | provisoire : SHA-256 du jeton v1, pour reprendre les cookies v1 (§ 5.5). Plusieurs appareils peuvent présenter le même jeton, chacun obtient sa `device_session`. Table supprimée au retrait de la transition (J+90) |
| `auth_tokens` | `id int PK`, `purpose smallint` (1 = connexion, 2 = changement d'email), `email citext`, `player_id uuid null`, `new_email citext null`, `token_hash bytea UNIQUE`, `expires_at`, `consumed_at null`, `created_at` | fusion de `MagicLinkTokens` et `EmailChangeTokens` ; CHECK cohérent avec `purpose` |

`user_agent_label` est un libellé grossier (« Chrome · Android », sans langue, décidé en B3), calculé à la création, pour la liste des appareils du profil. Aucune adresse IP n'est stockée.

### 4.3 Schéma `catalogue`

| Table | Colonnes | Contraintes et remarques |
|---|---|---|
| `tracks` | `id int PK`, `deezer_track_id bigint UNIQUE`, `artist text`, `title text`, `cover_hash text null`, `release_year smallint null`, `deezer_rank int null`, `rank_updated_at null`, `preview_status smallint` (0 inconnu, 1 disponible, 2 absent), `preview_checked_at null`, `disabled_at null`, `created_at`, `updated_at null` | `deezer_rank` servira à la difficulté de Runs ; `preview_status` distingue « Deezer en panne » de « pas de preview » (piège 16) |
| `genres`, `track_genres` | plus tard | pour les thèmes par genre de Runs ; la décennie se calcule depuis `release_year` |

### 4.4 Schéma `daily`

| Table | Colonnes | Contraintes et remarques |
|---|---|---|
| `challenges` | `id int PK`, `date date UNIQUE`, `seed int`, `origin smallint null` (1 nocturne, 2 à la volée, 3 admin) | `origin` est `null` pour l'historique repris |
| `challenge_tracks` | `challenge_id FK`, `position smallint`, `track_id FK catalogue.tracks` | PK `(challenge_id, position)`, UNIQUE `(challenge_id, track_id)`, index `(track_id)` pour le cooldown |
| `sessions` | `id int PK`, `player_id uuid FK`, `challenge_id FK`, `status smallint` (0 en cours, 1 terminée, 2 abandonnée, 3 expirée), `started_at`, `ended_at null`, `total_score int`, `total_listened_seconds numeric(6,2)`, `current_position smallint null`, `current_listened_seconds numeric(4,2) null`, `current_hint_level smallint default 0`, `freezes_used smallint default 0`, `freeze_earned bool default false` | UNIQUE `(player_id, challenge_id)` ; index `(challenge_id, status)` ; le morceau en cours est désigné par sa position |
| `answers` | `session_id FK`, `position smallint`, `listened_seconds numeric(4,2)`, `was_extended bool`, `hint_level smallint`, `artist_answer text null`, `title_answer text null`, `artist_correct bool`, `title_correct bool`, `score int`, `answered_at timestamptz null` | PK `(session_id, position)` ; `answered_at` nouveau, `null` pour l'historique |
| `streaks` | `player_id uuid PK FK players`, `current_streak int`, `last_played_date date null`, `freezes smallint` | sortie de `players` : la série n'existe que pour ce mode |
| `challenge_day_stats` | `challenge_id PK FK`, `computed_at`, `version smallint`, `payload jsonb` | photo figée du jour ; `version` permet de faire évoluer le format |

Le cooldown d'un morceau (dernière date, nombre d'utilisations) n'est plus stocké : il se calcule sur `challenge_tracks` + `challenges.date`.

### 4.5 Schéma `runs` : pas créé à la bascule (esquisse indicative)

**Aucune de ces tables n'existe dans la v2 livrée.** Elles seront conçues avec les règles du mode et créées par une migration EF au moment de le construire. L'esquisse ci-dessous sert seulement à vérifier que le modèle actuel ne bloque rien.

| Table | Colonnes principales |
|---|---|
| `runs` | `id`, `public_id uuid UNIQUE`, `player_id`, `seed`, `theme`, `status`, `round_number`, `lives`, `score`, `started_at`, `ended_at null`, `current_index`, `current_listened_seconds`, `current_hint_level`, `replay_of_run_id null` |
| `run_tracks` | PK `(run_id, index)`, `track_id`, `artist_correct`, `title_correct`, `points`, `answered_at` |
| `run_bonuses` | `run_id`, `bonus_code`, `slot`, `acquired_at`, `consumed_at null` |
| `personal_records` | PK `(player_id, theme)`, `best_score`, `best_round`, `run_id` |

Le fantôme rejoue les morceaux enregistrés dans `run_tracks` de la partie d'origine, jamais un nouveau tirage à partir de la graine : un morceau ajouté ou désactivé entre-temps fausserait la comparaison.

### 4.6 Schémas `infra` et `messaging`

- `infra.settings` : `key text PK` préfixée par module, `value jsonb`, `description text`, `updated_at`.
- `infra.data_protection_keys` : clés de chiffrement du cookie (même forme que la table actuelle).
- `jobs.*` : tables de Hangfire (tâches planifiées et historique, § 5.4 bis), créées par Hangfire.
- `messaging.*` : tables des messages durables, des messages planifiés et de l'outbox. Wolverine les crée **lui-même au démarrage** (pas les migrations EF, constaté en A2 : `MapWolverineEnvelopeStorage` ne fait que les déclarer au `DbContext`, exclues des migrations) ; son schéma par défaut est renommé en `messaging` (`PersistMessagesWithPostgresql(connectionString, "messaging")`). Le nom décrit le rôle, pas la librairie, et reste valable si on change un jour d'outil.

**Settings repris et convertis :**

| Clé v2 | Valeur jsonb (défaut) | Clé v1 |
|---|---|---|
| `Daily:GuessTimerSeconds` | `20` | `GuessTimerSeconds` |
| `Daily:AllowedDurationsSeconds` | `[0.5,1,1.5,2,3,5,10]` | `AllowedDurationsSeconds` |
| `Daily:TracksPerChallenge` | `5` | `TracksPerChallenge` |
| `Daily:DurationScores` | `[{"seconds":0.5,"score":1000},{"seconds":1,"score":850},…]` | `DurationScores` |
| `Daily:TrackCooldownDays` | `30` | `TrackCooldownDays` |
| `Daily:HintUnlockDurationsSeconds` | `[5,10]` | `HintUnlockDurationsSeconds` |
| `Daily:HintPenaltyPercent` | `{"1":30,"2":60}` | `HintPenaltyPercent` |
| `Daily:StreakFreezeEveryDays` | `7` | `StreakFreezeEveryDays` |
| `Daily:StreakFreezeMax` | `2` | `StreakFreezeMax` |
| `Daily:StreakLostNudgeMinDays` | `2` | `StreakLostNudgeMinDays` |
| `Catalogue:CoverUrlTemplate` | `"https://cdn-images.dzcdn.net/…"` | `CoverUrlTemplate` |

`DurationScores` est une liste d'objets et non un objet `{"0.5":1000}` : le binder de configuration .NET n'accepte pas de clé de dictionnaire décimale (il laisse le dictionnaire vide sans erreur). Constaté en A1, le 30/09/2026.

Toutes sont **relues à chaud** (`IOptionsMonitor`) : plus de différence entre les settings figés au démarrage et ceux relus en base.

---

## 5. Back

### 5.1 Structure de la solution

```
src/v2/back/
├── InSeconds.slnx
├── global.json
├── InSeconds.Api/                         composition + adaptateurs EF
│   ├── Program.cs                         court : AddInfrastructure(), AddModules(), MapModules()
│   ├── Infrastructure/
│   │   ├── Persistence/                   InSecondsDbContext, migration initiale, conventions
│   │   ├── Auth/                          cookie standard (AddCookie + validation de l'appareil), transition v1, policy Admin
│   │   ├── Settings/                      fournisseur de configuration infra.settings (jsonb)
│   │   ├── Errors/                        traduction résultat métier → ProblemDetails
│   │   └── Time/                          TimeProvider, GameCalendar
│   └── Modules/
│       ├── Players/    Domain/ Application/ Contracts/ Persistence/ PlayersModule.cs
│       ├── Catalogue/  …
│       ├── Gameplay/   …
│       └── Daily/      …          (Runs/ ajouté quand le mode sera construit)
├── InSeconds.Infrastructure/              emails Brevo + redirection, OpenTelemetry, réseau, rate limiting
├── InSeconds.Deezer/                      IPreviewProvider, ITrackSearch, ITrackMetadataSource (+ cache)
├── InSeconds.Api.Testing/                 seed, /api/e2e/*, faux Deezer, faux email, dev-login
└── tests/
    ├── InSeconds.UnitTests/               un dossier par module (domaine, politiques, adaptateurs purs)
    ├── InSeconds.IntegrationTests/        un dossier par module (HTTP + Testcontainers)
    ├── InSeconds.ArchitectureTests/
    └── InSeconds.MigrationTests/          import v1 → v2 sur jeux de données (§ 8.6)
```

Dans chaque module :

- **`Domain/` :** agrégats, objets valeur, événements, politiques ; aucune dépendance technique.
- **`Application/` :** une slice = un fichier (commande ou requête, validateur, handler Wolverine.Http).
- **`Contracts/` :** ce que les autres modules ont le droit d'utiliser (interfaces, événements, DTO).
- **`Persistence/` :** configurations EF, implémentation du store et des requêtes de lecture.

Chaque module expose un seul point d'entrée : `AddDaily(services)` et `MapDaily(routes)`.

### 5.2 Wolverine, pleinement utilisé

- **Wolverine.Http :** l'endpoint est le handler. Une méthode sert au chargement (`Load`, qui renvoie 404 si besoin), une aux règles bloquantes (`Before`/`Validate`), et `Handle` contient la logique.
- **Codegen statique en prod** (`TypeLoadMode.Static`, code généré par `codegen write` et **commité** dans `InSeconds.Api/Internal/Generated`, vérifié en CI ; fait en A2, en Production et Staging) et dynamique en dev : plus de compilation à l'exécution en prod.
- **Transactions automatiques** (`AutoApplyTransactions`) : les handlers n'appellent jamais `SaveChangesAsync`.
- **Outbox PostgreSQL :** un message enregistré dans la même transaction que la donnée est envoyé ensuite avec des retries. Concrètement :
  - emails (`SendMagicLinkEmail`, `SendEmailChangeConfirmation`) : une panne Brevo ne perd plus un lien ;
  - événements entre modules, quand un léger décalage est sans effet visible : `PlayerDeleted` → chaque module, `DailySessionCompleted` → usages futurs (Runs, stats).
  - **pas pour la série ni les gels** (relecture du 30/09) : le récap de fin de partie les relit juste après la dernière réponse. La série et les gels sont donc mis à jour **dans la même transaction** que la complétion (même module Daily), et le gel offert à la conversion est accordé dans la transaction de la conversion, par un contrat de Daily (`IStreakGrants`).
- **Tâches planifiées confiées à Hangfire** (§ 5.4 bis), qui déclenche des commandes Wolverine, à la place de `DailySchedule` et des `BackgroundService`.
- **FluentValidation** branchée dans le pipeline Wolverine.Http, avec des erreurs en `ProblemDetails`.

### 5.3 Abstractions (ports)

| Port | Module | Implémentation | Remplace |
|---|---|---|---|
| `TimeProvider` + `IGameCalendar` | .NET / Daily | système, `FakeTimeProvider` en test | 58 `DateTime.UtcNow` |
| `ICurrentPlayer` | Players/Contracts | claims du cookie | `HttpContext.GetPlayerIdOrNull()` |
| `IPlayerDirectory` | Players/Contracts | EF | accès direct aux `Player` |
| `IPlayerStore`, `ICatalogueStore`, `IDailyStore` (`IRunStore` plus tard) | chaque module | EF | `ApplicationDbContext` injecté partout |
| `IDailyStatsQueries`, `IAdminPlayersQueries`… | chaque module | EF, projections directes | requêtes dans `Endpoint.cs` |
| `IPreviewProvider` → `PreviewLookup` (`Found` / `Missing` / `Unavailable`) | Catalogue | Deezer + décorateur de cache | `CachedDeezerClient` concret, `null` ambigu |
| `ITrackUsage` (usage des morceaux : dernier jour, nombre, fin du cooldown, présence dans le défi du jour), `ITrackDirectory` (lecture des morceaux : noms, titre affiché, pochette, année) | Catalogue/Contracts | `ITrackUsage` : Daily (E), « aucun usage » d'ici là ; `ITrackDirectory` : EF | lecture directe du cooldown et des morceaux par les autres modules |
| `IJobTrigger` | `InSeconds.Api/Infrastructure/Jobs` | Hangfire (`TriggerJob`) | lancement d'une tâche par un bouton de l'admin (C1) |
| `ITrackSearch` | Catalogue | Deezer (+ cache pour la recherche publique) | idem |
| `ITrackMetadataSource` | Catalogue | Deezer | `GetTrackInfoAsync` |
| `IAnswerMatcher` | Gameplay | `FuzzyAnswerMatcher` (Levenshtein, accents, parenthèses) | `TextNormalizer` |
| `ISeededShuffle` | Gameplay | Fisher-Yates | code inline |
| `IHintProvider` | Gameplay | `YearHint`, `HangmanArtistHint` (plus tard `DecadeHint`, `GenreHint`) | `if (Level >= 2)` |
| `IDailyScoringPolicy` | Daily | paliers + pénalité d'indice | `ScoreCalculator` |
| `ITrackSelector` | Daily | `CooldownSeededSelector` | tirage inline |
| `IEmailSender` | Infrastructure | Brevo, `RedirectingEmailSender`, faux | déjà en place |
| `IEmailComposer<TModel>` | Players | un par email (gabarits HTML embarqués) | classes statiques |
| `IOptionsMonitor<DailyOptions>` etc. | chaque module | `infra.settings` | `AppSettings` unique + 2 lecteurs statiques |

**Règles de conception :**
- une interface par besoin, jamais par fournisseur ;
- des contrats de retour explicites plutôt que `null` ;
- des décorateurs plutôt que des `if (IsEnvironment(...))` : chaque environnement choisit ses implémentations à un seul endroit ;
- les handlers renvoient un résultat métier (`Result<T, Error>`), jamais `IResult` ;
- un `GET` n'écrit aucune donnée métier. Deux exceptions techniques, assumées : la conversion d'un cookie v1 et la mise à jour de `last_seen_at` (§ 5.5).

**Concession EF :** les entités ont un constructeur privé sans paramètre et des `private set`. C'est ce qu'EF exige pour matérialiser un objet, et ça n'expose rien.

### 5.4 Domaine, module par module

**Players**
- `Player` (identité, suppression logique), `Account` (email, pseudo, admin), `DeviceSession` (jeton haché, révocation), `AuthToken` (connexion, changement d'email).
- La conversion invité → compte crée l'`Account` et publie `PlayerLinked` (pas avant son premier consommateur, décidé en B2). Un compte déjà lié n'est jamais converti (piège 30).
- `last_seen_at` (appareil et joueur) est écrit dans `OnValidatePrincipal` (§ 5.5), au plus une fois toutes les 5 minutes : plus d'écriture à chaque requête, et l'onglet Joueurs garde une « dernière visite » précise.
- Les méthodes `…ForTesting` disparaissent : les tests utilisent des builders.

**Catalogue**
- `Track` avec des méthodes explicites : `Rename`, `Disable`/`Enable`, `RecordPreviewCheck`, `RecordRank`.
- Règles gardées :
  - renommage permis à tout moment, **défi du jour compris** (changé en v1 le 01/10, PR #246 : il fallait attendre le lendemain pour corriger une faute). Les réponses déjà enregistrées gardent leur verdict, les suivantes sont corrigées avec le nouveau nom, le nom affiché change pour tout le monde. Le front affiche un avertissement dans la modale quand le morceau est dans le défi du jour (`inTodayChallenge`) ; plus de code `catalogue.track_locked` ;
  - suppression interdite d'un morceau déjà utilisé ;
  - désactivation interdite pour un morceau du défi du jour.
- Nettoyage des titres affichés (`CleanDisplayTitle`) exposé dans les `Contracts`.

**Gameplay**
- `TrackRound` (objet valeur) :
  - `Listen(seconds)` garde le maximum écouté (plancher anti-triche) ;
  - `RevealHint(level, policy)` refuse si le palier n'est pas atteint ;
  - `Answer(artist, title, matcher)` renvoie un `RoundOutcome` **sans points**.
- Le calcul des points appartient au mode.

**Daily**
- `DailySession` (ex-`GameSession`) :
  - contient le `TrackRound` en cours ;
  - n'accepte une réponse que pour la position en cours, et refuse de déplacer le verrou (piège 35) ;
  - calcule le score par `IDailyScoringPolicy` ;
  - se termine seule quand elle a atteint le nombre **réel** de morceaux du défi (piège 38) ;
  - met à jour la série et les gels dans la même transaction, puis émet `DailySessionCompleted`.
- `DailyStreak` : appelé directement par la complétion (pas par un message), avec les règles actuelles (jours manqués sur la date du défi, piège 18 ; gels ; plafond) ; la vue de série effective est calculée à la lecture.
- `DailyChallenge` + `ChallengeGenerator` (`ITrackSelector`, graine = `DayNumber`) ; génération à la volée si le job de minuit a raté.
- `ChallengeDayStats` : photo figée d'un jour **terminé pour de bon**, c'est-à-dire J-2 : une partie de la veille peut encore se finir après minuit (piège 18), donc la veille et le jour même restent calculés en direct. Contenu : tout ce que renvoient aujourd'hui `stats/today` et `challenge-stats` (médiane, min, max, moyenne, répartition ; compteurs terminées, en cours, abandonnées, expirées ; par morceau : réponses, taux artiste, taux titre, taux de prolongation, taux d'échec, moyenne d'écoute, histogramme, « pas trouvé » ; liste des joueurs avec statut et score), **plus les paliers et barèmes utilisés ce jour-là**. Le pseudo et le titre ne sont pas figés : ils sont joints à la lecture, pour suivre un renommage. Les joueurs supprimés sont exclus (voir § 12 ter). Calculée par `CloseChallengeDay`, recalculable par l'admin.
- Stories hebdo : même logique qu'aujourd'hui, lue sur les données du module.

**Runs :** voir § 7.

### 5.4 bis Tâches planifiées : Hangfire (décidé le 30/09)

Clément veut des tâches de type cron, qu'il pilote lui-même, **avec des solutions existantes plutôt que du code maison**, même si ça change l'architecture. Wolverine sait exécuter un message planifié, mais ne gère ni les tâches récurrentes en cron ni leur affichage. On prend donc **Hangfire**, la bibliothèque de référence en .NET pour les tâches planifiées (plus de 10 ans, très répandue), avec son stockage PostgreSQL (`Hangfire.PostgreSql`).

**Répartition des rôles :**
- **Hangfire** décide quand lancer (cron), garde l'historique, réessaie en cas d'échec et fournit le tableau de bord.
- **Wolverine** reste le moteur applicatif : chaque tâche Hangfire est une classe d'une ligne qui appelle `IMessageBus.InvokeAsync(new GenerateDailyChallenge())`. La logique reste dans les modules, avec leurs transactions, et Hangfire ne connaît aucune règle métier.

**Mise en place :**
- Tables Hangfire dans un schéma dédié `jobs` de la base `inseconds` (option `SchemaName`).
- Tableau de bord servi par l'API sur `https://api.inseconds.cc/jobs`, protégé par la policy `Admin` (même cookie que le reste de l'admin). Un lien « Tâches planifiées » dans l'admin y mène.
- Tâches déclarées au démarrage (`RecurringJob.AddOrUpdate`), avec un cron lu dans la configuration (`Jobs:<nom>:Cron`, par environnement). Pour mettre une tâche en pause, on remplace son cron par `Cron.Never()`.
- Horaires en UTC.
- `[DisableConcurrentExecution]` sur chaque tâche : une tâche ne tourne jamais deux fois en même temps.
- Nombre d'essais et délai réglés par tâche (`[AutomaticRetry]`), par exemple la génération du défi réessaie toutes les 10 min, avec assez d'essais pour couvrir la journée (le défaut de Hangfire s'arrête à 10). Un pool insuffisant **lève une exception**, sinon Hangfire le compterait comme un succès et ne réessaierait pas. Pas de réessai Wolverine en plus, pour ne pas multiplier les tentatives.
- Traces OpenTelemetry autour de chaque exécution, comme pour le reste de l'API.
- **Fait en A2 :** chaque tâche implémente `IScheduledJob` et se déclare par `AddScheduledJob<T>(id, cron)` ; au démarrage, les tâches qui ne sont plus déclarées sont retirées. Un échec métier lève `JobFailedException(code)`, dont le code est rendu par `GET /api/admin/jobs/{id}` (toute autre exception devient `common.unexpected`, sans message). Deux workers seulement (`Jobs:Server:WorkerCount`) : peu de tâches, et chaque worker garde une connexion ouverte. Le tableau de bord exige aussi le jeton antiforgery sur ses actions.

**Ce que Clément peut faire dans le tableau de bord :** voir toutes les tâches, leur cron, leur prochaine et leur dernière exécution ; **lancer maintenant** ; consulter l'historique (réussites, échecs avec la pile d'erreur) ; relancer une exécution échouée. **Changer un horaire ou mettre en pause** se fait par la configuration, le temps d'un déploiement, car le tableau de bord de base ne le propose pas (la pause depuis le tableau de bord est une [demande ouverte](https://github.com/HangfireIO/Hangfire/issues/2289)). C'est un choix assumé : ces changements sont rares, et ils restent tracés dans Git.

**Tâches au départ :**

| Tâche | Cron par défaut (UTC) | Rôle |
|---|---|---|
| `catalogue-refresh` | `0 23 * * *` | previews et rang Deezer des morceaux éligibles au défi du lendemain |
| `daily-generate-challenge` | `0 0 * * *` | génère le défi du jour (retry toutes les 10 min) |
| `daily-close-day` | `5 0 * * *` | fige les stats de J-2 (la veille reste en calcul direct) |
| `players-purge-expired-tokens` | `30 3 * * *` | supprime les jetons expirés (connexion et changement d'email) |

Sur le staging, `catalogue-refresh` est en `Cron.Never()` (même IP que la prod, donc même quota Deezer, piège 16).

**Surveillance :** Hangfire n'alerte pas. Chaque exécution réussie envoie donc un ping à healthchecks.io, comme prévu pour les sauvegardes (décision du 28/09). Les sauvegardes restent un timer systemd, puisqu'elles tournent en dehors de l'API.

**Ce que ça remplace :**
- `GenerateDailyChallengeService`, `RefreshPreviewStatusService` et `DailySchedule`. Le piège 19 disparaît : Hangfire compare à l'horloge murale.
- Les boutons « Re-vérifier les previews » et « Générer le défi du jour » **restent** dans l'admin et **passent par Hangfire** (choix de Clément le 30/09), pour que chaque lancement apparaisse dans l'historique de `/jobs` :
  - le bouton appelle `POST …/generate-today` ou `…/refresh-previews`, qui déclenche la tâche récurrente correspondante (`RecurringJob.TriggerJob`) et renvoie `202` avec l'identifiant de l'exécution ;
  - l'écran interroge `GET /api/admin/jobs/{id}` (toutes les 2 s) jusqu'à la fin : état (en file, en cours, réussi, en échec, réessai prévu) et **compte rendu**, c'est-à-dire la valeur renvoyée par la tâche (`{checked, updated, failed}`, défi créé ou déjà présent) que Hangfire conserve ; en échec, le code d'erreur (`pool_insufficient`) ;
  - un second clic pendant une exécution ne relance rien (`[DisableConcurrentExecution]`) : l'écran suit l'exécution en cours ;
  - le code reste écrit une seule fois, dans la commande Wolverine appelée par la tâche.
- **E2E :** le serveur Hangfire tourne aussi en Testing pour ces deux boutons, avec toutes les tâches récurrentes en `Cron.Never()` et un intervalle de scrutation court ; les fixtures qui ont juste besoin d'un défi appellent `/api/e2e/generate-today`, synchrone.
- Tout le code maison envisagé plus tôt (tables `scheduled_jobs`/`job_runs`, planificateur, onglet admin) : **abandonné**.

**Alternative écartée pour l'instant, TickerQ :** bibliothèque récente, avec un tableau de bord qui permet aussi de modifier le cron et de mettre en pause, et un stockage EF Core. Plus complète sur le papier, mais beaucoup plus jeune que Hangfire, donc plus risquée à maintenir. À reconsidérer si changer les horaires par la configuration devient gênant.

**Environnements de test :** en intégration, le serveur Hangfire ne tourne pas : les tests appellent les tâches directement (plus un test du suivi d'exécution par `GET /api/admin/jobs/{id}`). En E2E, il tourne avec les tâches récurrentes en pause, uniquement pour les deux boutons admin ; les autres besoins passent par `/api/e2e/*`. En développement local, il tourne normalement.

**Tests :**
- chaque tâche appelée directement en intégration ;
- un test qui vérifie que toutes les tâches attendues sont enregistrées avec le bon cron ;
- un test que `/jobs` refuse un non-admin.

### 5.5 Authentification et autorisation

- **Authentification par cookie standard d'ASP.NET Core** (`AddAuthentication().AddCookie()`), plutôt qu'un schéma maison. Proposé par Clément le 30/09 :
  - le ticket (claims `PlayerId` et `DeviceSessionId` seulement) est chiffré et signé par Data Protection, avec les clés en base ;
  - le cookie est `HttpOnly`, `Secure`, `SameSite=Lax`, avec une durée de 90 jours glissante (renouvelé à l'usage), et le préfixe `__Host-` en prod et en staging ;
  - **la révocation reste possible côté serveur :** `OnValidatePrincipal` vérifie que la `device_session` existe et n'est pas révoquée, puis ajoute le rôle admin lu en base. Le résultat est mis en cache une minute : une déconnexion ou un retrait du rôle admin s'appliquent en moins d'une minute ;
  - `last_seen_at` (appareil et joueur) est mis à jour au même endroit, au plus toutes les 5 minutes (R17) ;
  - les réponses d'API gardent des 401 et 403 (`OnRedirectToLogin` et `OnRedirectToAccessDenied` surchargés), jamais de redirection HTML ;
  - **reprise des cookies v1, sans déconnecter personne :** le cookie v1 `authToken` contient seulement le jeton chiffré, pas un ticket ASP.NET. Un petit middleware de transition le lit avec les mêmes clés **et les mêmes paramètres Data Protection que la v1** (`SetApplicationName("InSeconds")`, purpose `InSeconds.Auth.Cookie`, cf. `Program.cs:251-256` v1), le hache, retrouve le joueur, **crée une nouvelle `device_session` à chaque conversion** (un même jeton converti depuis moins d'une minute retrouve sa session : les requêtes parallèles du premier chargement n'en ouvrent qu'une, décidé en B1), émet le nouveau cookie standard et supprime l'ancien. En v1, tous les appareils d'un compte partagent le même `AuthToken` : le hash n'est donc pas à usage unique, il reste valable jusqu'au retrait du middleware (J+90, la durée de vie maximale d'un cookie v1) ;
  - **une erreur de base ne déconnecte jamais** (piège 37) : si `OnValidatePrincipal` ou le middleware de transition n'arrivent pas à lire la base, la requête échoue en 500 ; seul un cookie réellement invalide ou révoqué est rejeté. Test dédié.
- **Policy `Admin`** posée sur tout le groupe `/api/admin` : un endpoint admin ne peut plus être oublié.
- **Plus de contournement `Bearer admin-token` en Testing :** `InSeconds.Api.Testing` fournit un endpoint de connexion admin de test.
- **Création d'invité par une commande explicite** (`POST /api/players/guest`), jamais par un `GET`. Le démarrage d'une partie la déclenche si besoin.
- **Déconnexion :** révoque l'appareil courant. « Déconnecter les autres appareils » révoque tous les autres.
- **Cookie :** `SameSite=Lax` et `Secure` en prod et en staging, `Strict` sans `Secure` en Testing (inchangé).
- **Anti-CSRF :** `OriginValidator` gardé sur la vérification du magic link (`TrustedOrigins` en v2 : `Cors:AllowedOrigins` plus `Auth:TrustedOrigins` pour les fronts locaux servis par le proxy d'`ng serve`, décidé en B2).
- **Rate limiting :** mêmes politiques qu'aujourd'hui, déclarées une fois par groupe de routes, désactivées en Testing par configuration et non par condition dans le code. Le piège 27 (`KnownIPNetworks`) est conservé.

### 5.6 Routes de l'API

Le préfixe change, pas l'adresse. Toutes les erreurs sont en `ProblemDetails` avec un champ `code` stable et le `traceId`.

| v1 | v2 |
|---|---|
| `GET /api/settings` | `GET /api/daily/settings` |
| `GET /api/sessions/today` | `GET /api/daily/today` (lecture seule, ne génère rien) |
| `POST /api/sessions` | `POST /api/daily/sessions` |
| `PATCH /api/sessions/{id}/listening` | `PATCH /api/daily/sessions/{id}/listening` |
| `POST /api/sessions/{id}/hint` | `POST /api/daily/sessions/{id}/hints` |
| `POST /api/sessions/{id}/answers` | `POST /api/daily/sessions/{id}/answers` |
| `PUT /api/sessions/{id}/abandon` | `POST /api/daily/sessions/{id}/abandon` |
| `GET /api/stats/today` | `GET /api/daily/stats/today` |
| `GET /api/deezer/search` | `GET /api/catalogue/search` |
| `POST /api/auth/magic-link/request` | `POST /api/players/auth/magic-link` |
| `POST /api/auth/magic-link/verify` | `POST /api/players/auth/magic-link/verify` |
| `POST /api/auth/logout` | `POST /api/players/auth/logout` |
| (nouveau) | `POST /api/players/guest` |
| `GET /api/players/me` | `GET /api/players/me` (lecture seule, 204 sans identité ; `BrowserIdComponent` et la spec E2E `streak-freeze` appellent d'abord `POST /api/players/guest`) |
| `PUT /api/players/me/pseudo` | `PUT /api/players/me/pseudo` |
| `PUT /api/players/me/email` | `POST /api/players/me/email-change` |
| `POST /api/auth/email-change/confirm` | `POST /api/players/email-change/confirm` |
| (nouveau) | `GET /api/players/me/devices`, `DELETE /api/players/me/devices/{id}`, `POST /api/players/me/devices/revoke-others` |
| `GET /api/admin/me` | `GET /api/admin/me` |
| `GET /api/admin/stats` | `GET /api/admin/daily/dashboard` |
| `GET /api/admin/challenge-stats` | `GET /api/admin/daily/challenges/stats` |
| (nouveau) | `POST /api/admin/daily/challenges/{date}/stats/recompute` |
| `GET /api/admin/challenges` | `GET /api/admin/daily/challenges` |
| `POST /api/admin/challenges` (création à la main) | **abandonnée** : aucun écran ne l'appelle (seulement le client généré et des tests d'intégration), confirmé par Clément le 30/09 |
| `POST /api/admin/generate-today` | `POST /api/admin/daily/challenges/generate-today` : déclenche la tâche Hangfire, `202` + identifiant d'exécution |
| `GET /api/admin/weekly-recap` | `GET /api/admin/daily/weekly-recap` |
| `PUT /api/admin/settings/track-cooldown-days` | `PUT /api/admin/daily/settings/track-cooldown-days` |
| `/api/admin/tracks` (liste, ajout, renommage, actualisation, désactivation, suppression) | `/api/admin/catalogue/tracks…` (mêmes opérations) |
| recherche Deezer admin | `GET /api/admin/catalogue/deezer-search` |
| `POST /api/admin/refresh-previews` | `POST /api/admin/catalogue/refresh-previews` : déclenche la tâche Hangfire, `202` + identifiant d'exécution |
| (nouveau) | `GET /api/admin/jobs/{id}` : état et compte rendu d'une exécution |
| (nouveau) | `/jobs` : tableau de bord Hangfire (HTML), réservé aux admins |
| `GET /api/admin/players` | `GET /api/admin/players` |
| `GET /api/admin/players/{id}/history` | `GET /api/admin/daily/players/{id}/history` |
| `POST /api/client-errors` | inchangé |
| `/health`, `/health/ready` | inchangés (mêmes champs, le front les lit) |
| `/api/e2e/*`, `/api/auth/dev-login` | mêmes chemins, servis uniquement par `InSeconds.Api.Testing` |

**Écarts de Catalogue avec la v1 (C1)** : ajouter un identifiant Deezer déjà dans le pool répond **409 `catalogue.duplicate_deezer_id`** (la v1 renvoyait le morceau existant) ; un identifiant inconnu de Deezer : **422 `catalogue.not_found_on_deezer`** ; Deezer en panne ou quota dépassé : **503 `catalogue.deezer_unavailable`** ; la suppression répond **204** ; la liste du pool est **plate**, l'usage (`usageCount`, `lastUsedDate`, `unlockDate`, `inTodayChallenge`) étant joint à chaque morceau (la v1 renvoyait `{ available, used }`) ; la recherche, publique ou admin, vide au-delà de 100 caractères comme en dessous de 2 ; la recherche admin répond **503 `catalogue.deezer_unavailable`** quand Deezer est en panne (la v1 renvoyait une liste vide, indiscernable de « aucun résultat »), la recherche publique reste vide.

**Codes d'erreur** (contrat publié dans OpenAPI), par exemple : `daily.no_challenge`, `daily.already_played`, `daily.session_not_found`, `daily.track_lock_not_released`, `daily.hint_locked`, `daily.already_answered`, `players.email_taken`, `players.pseudo_taken`, `players.same_email`, `players.invalid_or_expired_token`, `players.guest_forbidden`, `catalogue.track_in_use`, `catalogue.track_in_today_challenge`, `catalogue.duplicate_deezer_id`, `catalogue.not_found_on_deezer`, `catalogue.deezer_unavailable`, `admin.pool_insufficient`, `admin.challenge_exists`, `common.validation`, `common.rate_limited`, `common.new_version`.

### 5.7 Observabilité

- Même configuration OpenTelemetry (dans `InSeconds.Infrastructure`) et même export OTLP optionnel.
- `PlayerActionLog` garde **les mêmes noms d'événements et de champs** : les tableaux de bord Grafana existants continuent de fonctionner, et les identifiants étant conservés, les anciennes traces restent rattachables.
- Nouvelles traces : messages Wolverine (outbox), tâches Hangfire, import.
- Règle inchangée : jamais d'email, de pseudo, de réponse saisie, de cookie ni d'`Authorization` dans la télémétrie.

### 5.8 Tests du back

| Niveau | Contenu |
|---|---|
| Unitaires | domaine de chaque module (`DailySession`, `TrackRound`, `DailyStreak`, politiques de score et d'indices, sélecteur de morceaux), `FuzzyAnswerMatcher`, statistiques, clients Deezer et Brevo |
| Intégration | Testcontainers + `WebApplicationFactory`, un dossier par module ; les scénarios des ~210 tests actuels réécrits sur les nouvelles routes et les codes d'erreur ; Respawn sur les nouveaux schémas |
| Architecture | règles du § 3.3 |
| Import | voir § 8.6 |
| Pièges | chaque piège du CLAUDE.md qui touche le back garde **un test nommé** (18, 19, 27, 30, 31, 35, 37, 38, 39…) |

---

## 6. Front

### 6.1 Organisation

Une organisation **par domaine** calquée sur les modules du back, avec quatre couches par domaine et des frontières vérifiées par Sheriff.

```
src/v2/front/InSeconds.Client/src/app/
├── core/          session et auth, erreurs par code, langue, détection de nouvelle version,
│                  ports transverses (ClockPort, StoragePort)
├── ui/            kit de la DA : bouton, modale (CDK Dialog), panneau bas, toast, badge,
│                  graphiques ; purement visuel, gère focus, Échap et ARIA
├── api/           clients NSwag, un par module (DailyClient, PlayersClient, CatalogueClient,
│                  AdminClient ; RunsClient plus tard)
├── gameplay/      mécanique d'un morceau, partagée par les modes
├── daily/         le défi du jour
├── (runs/)        le nouveau mode, créé quand il sera construit
├── account/       connexion, vérification, profil, appareils, confirmation d'email
├── admin/         catalogue, daily, joueurs
└── home/          choix du mode, quand Runs sera public
```

Dans chaque domaine :

| Couche | Contenu | Peut importer |
|---|---|---|
| `domain/` | types, machines à états, règles d'affichage ; TypeScript pur | rien d'Angular |
| `data-access/` | SignalStores, adaptateurs API | `domain`, `api`, `core` |
| `feature/` | pages routées (conteneurs) | `data-access`, `ui`, `domain` |
| `ui/` | composants de présentation (entrées/sorties uniquement) | `domain`, `ui/` global |

### 6.2 Stores : NgRx SignalStore

- Un `signalStore(...)` par sujet (partie du jour, série, manche, pool admin…), fourni au niveau de la route qui l'utilise.
- `withState`, `withComputed`, `withMethods`, `rxMethod` pour les appels API.
- **Morceaux partagés** (`signalStoreFeature`) :
  - `withRequestStatus` dans `core` (chargement, erreur avec code) ;
  - `withTrackRound` dans `gameplay`, qui enveloppe la machine à états d'une manche, pour Daily et Runs ;
  - `withEntities` pour les listes de l'admin (catalogue, joueurs).
- **Les machines à états restent en TypeScript pur dans `domain/`.** Le store les enveloppe : son état est celui de la machine, ses méthodes sont les transitions.
- **État protégé** (option par défaut de SignalStore) : on ne le modifie que par les méthodes du store.
- **Les effets visuels ne vivent pas dans les stores :** count-up du score, toasts, `localStorage`. Ils passent par des composants ou un service d'effets.
- Redux DevTools en dev uniquement (`@angular-architects/ngrx-toolkit`).
- **Dependabot :** `@ngrx/signals` rejoint le groupe `angular` (versions alignées, piège 15).

### 6.3 `gameplay`, la manche partagée

- **`domain/`** : machine à états d'un morceau, `chargement → écoute → saisie → envoi → révélé`, plus `erreur audio` et `erreur d'envoi`.
- **`data-access/`** :
  - `withTrackRound` ;
  - `AudioPort` implémenté avec **Howler.js en mode Web Audio** (décision du 01/10/2026), à la place de l'élément `<audio>` et du chrono de la v1. L'extrait est téléchargé puis décodé en mémoire, et le navigateur s'arrête lui-même au palier, à l'échantillon près : plus de chrono, d'événement `playing` ni de surveillance de `currentTime`, ce qui fait disparaître les pièges 44 et 46. Howler gère aussi le déverrouillage audio d'iOS et la reprise après une interruption. Points imposés :
    - CORS du CDN des extraits vérifié le 02/10/2026 (`cdnt-preview.dzcdn.net` renvoie `Access-Control-Allow-Origin: *`, environ 480 Ko par extrait) : les extraits sont chargés directement depuis Deezer, sans passer par l'API ; une fois l'extrait chargé, l'expiration de sa signature (piège 14) n'a plus d'effet ;
    - iPhone en mode silencieux : Web Audio y est muet par défaut, poser `navigator.audioSession.type = "playback"` quand c'est disponible ;
    - mémoire : un extrait décodé pèse environ 10 Mo, ne décoder que le morceau en cours et le suivant ;
    - « écouter plus » relance la lecture depuis la position atteinte avec le nouveau palier ;
    - Howler évolue peu (dernière version vers 2023) : version figée, tickets iOS ouverts vérifiés avant de coder ;
    - comportements v1 gardés et testés au niveau de l'`AudioPort` et de la manche : état `error` distinct de `idle` (piège 33), prolongation pendant le chargement et relecture sans effacer `wasExtended` (piège 40), autoplay une seule fois par morceau (piège 44) ;
  - `AnswerSearchPort` (autocomplete, debounce 300 ms).
- **`ui/`** : lecteur (barre, repères de paliers), saisie avec autocomplete et navigation clavier, bouton effacer, carte de révélation, histogramme (`GuessTimeChart`), liste de résultats en accordéon.
- **Ce qui varie selon le mode est injecté :**
  - `ListenPolicy` : paliers prolongeables pour Daily, durée fixe pour Runs ;
  - `HintPolicy` : indices proposés et moment où ils se débloquent ;
  - un emplacement de projection pour les actions du mode (« Indice », « Passer », bonus).

### 6.4 `daily`

- **domain :**
  - machine à états de la partie (`welcome`, `resume_prompt`, `playing`, `done`, `already_played`, `no_challenge`, `error`) ;
  - règles d'affichage de la série et des gels (mode de la gélule, pluriels, dates UTC) ;
  - construction du texte de partage.
- **data-access :** `DailyGameStore`, `DailyStreakStore`, `DailyStatsStore`, adaptateur `DailyApi`.
- **feature :**
  - pages : accueil, reprise, partie, récap, « déjà joué » ;
  - garde de sortie en cours de partie, synchronisation multi-onglets, soumission avec réessais (piège 32).
- **ui :** gélule série, panneau série, cases de gels, égaliseur des scores, bouton de partage, toasts de gel. Déplacés depuis `shared/`, puisqu'ils n'existent que pour ce mode.

### 6.5 `account` et `admin`

- **account :**
  - `/login` et `/login/verify` avec le bouton « Confirmer » explicite (piège 21) et l'avertissement « déjà connecté » (piège 30) ;
  - profil : pseudo, email, série, **appareils connectés** et « déconnecter les autres appareils » ;
  - `/account/confirm-email`.
- **admin :** routes enfants `/admin/catalogue`, `/admin/daily` (dashboard, défis avec bouton « recalculer les stats », stories), `/admin/players`, un lien vers le tableau de bord Hangfire (tâches planifiées, § 5.4 bis), les boutons « Générer le défi du jour » et « Re-vérifier les previews » (lancés par Hangfire, l'écran suit l'exécution et affiche le compte rendu), l'ID du navigateur (`BrowserId`, qui crée l'invité par `POST /api/players/guest`) et les chips « toi » de l'onglet Défis, l'heure de déploiement (piège 25), plus tard `/admin/runs`. La garde admin repose sur `/api/admin/me`.

### 6.6 Transverse

- **Routes chargées à la demande**, chacune fournissant ses stores :
  - `/daily`, `/account/...`, `/admin/...`, `/privacy` (`/runs` viendra avec le mode) ;
  - redirections pour que tous les liens existants restent valables : `/` → `/daily` (tant que Runs n'est pas public), `/blindtest` → `/daily`, `/login`, `/profile` et `/profile/confirm-email` → `/account/…`, `/confidentialite` → `/privacy`. Toutes gardent la query string (lien magique, `from=legacy`).
- **Avis « l'adresse a changé »** (`from=legacy`, redirection `code.run` de nginx) repris tel quel.
- **Erreurs :** une seule table traduit un code en clé i18n (`errors.daily.already_played`). Les codes inconnus tombent sur un message générique avec le `traceId`. La remontée vers `/api/client-errors` est gardée.
- **i18n :** ngx-translate, clés rangées par domaine, test CI de synchronisation entre `fr.json` et `en.json`.
- **Nouvelle version :** gérée par le service worker d'Angular (`SwUpdate`, événement `VERSION_READY`), c'est-à-dire la solution existante plutôt qu'une comparaison maison avec `/health`. Au retour au premier plan, l'app vérifie s'il existe une nouvelle version et propose de recharger. Le code `common.new_version` renvoyé par les anciennes routes déclenche la même proposition.
- **PWA** (`@angular/service-worker`), pour l'installation sur l'écran d'accueil :
  - l'index et les traductions restent revalidés (piège 20) ;
  - la mise à jour passe par la détection de version ;
  - le job CI `nginx-headers` est étendu à `ngsw.json`.
- **Overlay « Service indisponible »** gardé (3 échecs de `/health`).
- **Accessibilité :** cible WCAG 2.1 AA, portée par `ui/`.
- **SEO :** `robots.txt` et `sitemap.xml` mis à jour avec les nouvelles routes (`/daily`).

### 6.7 Tests du front

- **Vitest :**
  - `domain/`, en TypeScript pur sans Angular : machines à états, règles de série, texte de partage ;
  - stores ;
  - `AudioPort` (Howler.js) dans un vrai Chromium, avec le lanceur qui autorise l'autoplay ;
  - composants de `ui/` sur leurs entrées/sorties.
- **Sheriff en CI.**
- **Playwright :**
  - les **~97 E2E existants** doivent passer sur la v2 avec les mêmes scénarios ; seuls les sélecteurs et les URL qui changent sont adaptés, dans une PR dédiée et relue ;
  - nouveaux E2E : appareils connectés, recalcul des stats, redirections des anciennes adresses (query string gardée), avis `from=legacy` ;
  - `serviceWorkers: 'block'` dans la config Playwright ;
  - un check CI compare la liste des E2E v1 et v2 (§ 12 ter, E8).
- **Un piège, un test** (front) : 20, 21, 25, 28, 30, 32, 33, 40, 41, 42, 44 repris avec leurs tests actuels ou un équivalent.

---

## 7. Mode Runs

- **Rien de Runs n'est créé à la bascule** (décision du 30/09) : ni module, ni schéma, ni tables, ni routes, ni dossier front.
- **Ce que la v2 prépare quand même, parce que le Daily en a besoin ou que ça ne coûte rien :**
  - `TrackRound`, `ISeededShuffle` (utilisés par le Daily) ;
  - `deezer_rank` rempli chaque nuit ;
  - `IHintProvider` et la politique de score par mode (utilisés par le Daily) ;
  - côté front, `gameplay/` (utilisé par le Daily) ;
  - les règles d'architecture qui réservent la place d'un second mode.
- **Créé avec le mode, plus tard :** module `Runs`, schéma `runs` et ses tables (migration EF classique), `IBonus`, `IRunTrackSelector`, `IRunScoringPolicy`, routes `/api/runs/...`, dossier front `runs/`, accueil avec choix du mode, onglet admin.
- **Ce qu'on demande au mode :** passer par `TrackRound` pour la mécanique d'un morceau, et ranger ses métadonnées (difficulté, genre) dans `Catalogue`.
- **Reste à décider dans le fil « Nouveau mode de jeu »,** entièrement à l'intérieur du module : seuil par manche ou fin au premier raté, calcul de la difficulté à partir du rang, liste des bonus, thèmes, durée d'écoute, nom, forme exacte du partage.
- **Ordre :** la v2 part en prod avec le seul défi du jour. Runs est construit ensuite ; ses tables sont créées à ce moment, sans reprise de données.

---

## 8. Reprise des données existantes

### 8.1 Règles

- **Tout ce qui est utile est repris, identifiants compris.**
- **Personne n'est déconnecté,** personne ne perd sa série, ses gels, son historique ni une partie en cours.
- **Seul l'inutile est abandonné, et seulement après vérification** qu'il est bien redondant, mort ou expiré.
- **L'import est un script SQL versionné, rejoué à l'identique** sur le staging puis en prod, dans **une seule transaction**.

### 8.2 Correspondance table par table

| v1 | v2 | Traitement |
|---|---|---|
| `Players` (`Id`, `CreatedAt`, `LastSeenAt`) | `players.players` | repris tels quels |
| `Players.IsDeleted` / `DeletedAt` | `players.deleted_at` | repris ; si `IsDeleted` sans `DeletedAt`, `deleted_at = COALESCE(LastSeenAt, CreatedAt)` (jamais une date inventée) ; le nombre de ces cas est affiché par l'import |
| `Players` non invités (`Email`, `Pseudo`, `IsAdmin`) | `players.accounts` | une ligne par joueur `IsGuest = false` ; `linked_at = null`. Les pseudos v1 sont uniques **en respectant la casse** : un pré-contrôle en prod (`GROUP BY lower("Pseudo") HAVING count(*) > 1`) liste les doublons « Bob » / « bob », à régler avant l'import (voir § 13) |
| `Players.AuthToken` | `players.legacy_tokens` | une ligne par joueur : `token_hash = sha256(AuthToken::text)`. Pas de `device_session` importée : chaque appareil en obtient une à sa première visite (§ 5.5). Table supprimée à J+90 |
| `Players.CurrentStreak`, `LastPlayedDate`, `StreakFreezes` | `daily.streaks` | une ligne par joueur ayant une série, une date ou un gel ; valeurs brutes |
| `Tracks` | `catalogue.tracks` | repris ; `HasPreview` → `preview_status` (1 ou 2) ; `IsDisabled` → `disabled_at = COALESCE(UpdatedAt, now())` ; `deezer_rank = null` (rempli la nuit suivante) |
| `Tracks.LastUsedDate`, `UsageCount` | (calculé) | **vérifiés** contre le calcul depuis `challenge_tracks`, puis abandonnés |
| `DailyChallenges` | `daily.challenges` | repris, `origin = null` |
| `DailyChallengeTracks` | `daily.challenge_tracks` | repris ; `DeezerRankSnapshot` abandonné après vérification qu'il vaut la position partout |
| `GameSessions` | `daily.sessions` | repris ; `started_at = CreatedAt` ; `ended_at = COALESCE(CompletedAt, AbandonedAt)` ; `CurrentTrackId` (un `DailyChallengeTrack.Id`) → `current_position` par jointure ; `CurrentTrackMinListenedSeconds` → `current_listened_seconds` |
| `GameSessionAnswers` | `daily.answers` | repris ; `DailyChallengeTrackId` → `position` par jointure ; `answered_at = null` |
| `MagicLinkTokens`, `EmailChangeTokens` | `players.auth_tokens` | seuls les jetons non consommés et non expirés (en pratique aucun, vu la coupure) ; `TokenHash` v1 est un texte hexadécimal, converti en `bytea` par `decode(…, 'hex')` |
| `Settings` | `infra.settings` | clés préfixées, valeurs converties en `jsonb` (§ 4.6) ; toute clé inconnue fait échouer l'import |
| `DataProtectionKeys` | `infra.data_protection_keys` | **copiées obligatoirement** : sans elles, aucun cookie ne se déchiffre |
| (rien) | `daily.challenge_day_stats` | calculées pour tous les jours passés juste après l'import |

### 8.3 Ce qui est abandonné, et pourquoi c'est sans perte

| Donnée | Pourquoi |
|---|---|
| `Tracks.LastUsedDate`, `UsageCount` | recalculables depuis les défis ; tout écart bloque l'import. (La route de création à la main, qui ne mettait pas ces colonnes à jour, n'a jamais eu d'écran : aucun écart attendu. S'il y en a un, l'import s'arrête et on regarde.) |
| `DailyChallengeTracks.DeezerRankSnapshot` | vaut la position partout (vérifié) |
| `DailyChallengeTracks.Id`, `GameSessionAnswers.Id` | remplacés par les clés `(challenge_id, position)` et `(session_id, position)` ; aucune référence extérieure |
| jetons de connexion expirés ou consommés | inutilisables |
| `Players.IsGuest` | déduit de l'absence de ligne `accounts` |

### 8.4 Mécanique

Tout est versionné dans `deploy/migration-v2/` :

```
deploy/migration-v2/
├── run-import.sh           enchaîne les étapes, une seule transaction, s'arrête à la première erreur
├── 00-import-state.sql     crée infra.import_state (B4)
├── 10-import.sql           vide les tables v2, puis INSERT … SELECT depuis public.*
├── 20-verify.sql           contrôles, lève une exception au moindre écart (annule l'import)
├── 90-import-done.sql      note l'import réussi (B4)
├── import-to-staging.sh    staging : import puis seconde anonymisation (B4)
├── 30-stats.sql            (ou commande de l'API) calcul des stats figées de l'historique
└── README.md               mode d'emploi, retour arrière
```

Tout se passe dans la même base, sans dump ni restauration :

1. **À l'avance, sans coupure :** l'API v2 lancée avec `--migrate-only`, un point d'entrée qui applique les migrations **sans démarrer** ni Hangfire, ni Wolverine, ni le serveur HTTP (testé en CI). Elle crée les schémas v2, les tables, l'extension `citext` (dans un schéma `extensions`, pas dans `public`, pour que la copie prod → staging de `public` ne la touche pas), puis s'arrête. Les tables de Wolverine (`messaging`) et de Hangfire (`jobs`) ne sont pas créées à ce moment : elles le sont au premier démarrage de l'API v2 (décision A2, § 4.6). La v1 continue de tourner : elle ne voit rien de tout ça.
2. **Le jour J, v1 arrêtée :** `10-import.sql` dans une seule transaction. Il vide les tables v2 (le script est rejouable autant de fois que nécessaire), copie les données depuis `public.*`, puis remet les séquences à niveau (`setval` au plus grand identifiant importé). **Garde-fou :** une fois la v2 ouverte aux joueurs, un marqueur `infra.import_state` bloque toute nouvelle exécution (sinon on effacerait les parties jouées en v2), sauf option `--force` explicite.
3. `20-verify.sql` : au moindre écart, **arrêt** (§ 8.5).
4. Calcul des stats figées de tous les jours passés.
5. **Les tables v1 de `public` sont gardées quelques semaines,** puis supprimées après une sauvegarde archivée (étape 12).

**Extrait représentatif de l'import :**

```sql
INSERT INTO daily.sessions (id, player_id, challenge_id, status, started_at, ended_at,
    total_score, total_listened_seconds, current_position, current_listened_seconds,
    current_hint_level, freezes_used, freeze_earned)
SELECT s."Id", s."PlayerId", s."DailyChallengeId", s."Status", s."CreatedAt",
       COALESCE(s."CompletedAt", s."AbandonedAt"),
       s."TotalScore", s."TotalDurationSeconds", ct."Position",
       s."CurrentTrackMinListenedSeconds", s."CurrentTrackHintLevelUsed",
       s."FreezesUsed", s."FreezeEarned"
FROM public."GameSessions" s
LEFT JOIN public."DailyChallengeTracks" ct
       ON ct."Id" = s."CurrentTrackId"
      AND ct."DailyChallengeId" = s."DailyChallengeId";

INSERT INTO players.legacy_tokens (player_id, token_hash)
SELECT p."Id", sha256(convert_to(p."AuthToken"::text, 'UTF8'))
FROM public."Players" p;
```

Le format exact du texte haché (Guid en minuscules avec tirets) est fixé une fois dans l'API et testé des deux côtés, pour garantir qu'un cookie existant retrouve bien son appareil.

### 8.5 Vérifications (bloquantes)

| Contrôle | Règle |
|---|---|
| Nombre de lignes | joueurs, comptes, anciens jetons (= joueurs), défis, morceaux du défi, sessions, réponses, morceaux, settings, clés Data Protection : identiques à la source |
| Scores | somme de `total_score` par défi et par joueur identique ; somme des `score` des réponses = `total_score` pour chaque session terminée |
| Séries | `current_streak`, `last_played_date` et `freezes` identiques pour chaque joueur |
| Comptes | chaque email et chaque pseudo retrouvés, `is_admin` identique |
| Jetons | pour chaque joueur, `sha256(AuthToken)` présent dans `legacy_tokens` |
| Parties en cours | chaque session `Pending` a sa position en cours correcte (ou `null` si aucun verrou) |
| Cooldown | dernière date et nombre d'utilisations recalculés = `LastUsedDate` / `UsageCount` d'origine |
| Forme de la source | les colonnes lues dans `public` existent avec le type attendu (`information_schema`), pour détecter une migration v1 arrivée pendant le chantier |
| Colonne morte | `DeezerRankSnapshot = Position` sur toutes les lignes |
| Intégrité | aucune réponse orpheline, aucune position hors du défi, aucun doublon `(player_id, challenge_id)` |
| Settings | toutes les clés v1 connues et converties ; valeurs relues par l'API v2 identiques aux valeurs v1 |

### 8.6 Tests de l'import

- **Projet `InSeconds.MigrationTests` :**
  - il crée une base de **forme v1**, générée en CI par `dotnet ef migrations script` sur le code v1 (pas une copie figée qui dériverait) ;
  - il y insère des jeux de données de cas limites, lance `run-import.sh` et vérifie le résultat.
- **Cas couverts :**
  - invité sans partie, invité avec série ;
  - compte admin, compte supprimé ;
  - partie en cours avec un verrou et un indice, partie abandonnée, partie expirée ;
  - réponses partielles ;
  - morceau désactivé, morceau sans preview ;
  - gels consommés et gagnés ;
  - jeton de connexion en cours ;
  - settings aux valeurs non par défaut.
  - pseudos en doublon de casse, joueur supprimé sans date, session `Pending` d'un jour passé avec verrou ;
  - relance de l'import après ouverture : refusée sans `--force`.
- **Test de bout en bout :** un cookie émis par la v1 (mêmes clés et paramètres Data Protection) est accepté par la v2 après import, donne le même joueur et est remplacé par le nouveau cookie standard. **Le même cookie v1 présenté par deux navigateurs** donne deux appareils du même joueur, sans déconnexion.

### 8.7 Scripts existants à réécrire

- `deploy/vps/copy-prod-db-to-staging.sh` : il devient « copie prod v2 → staging v2 », avec l'anonymisation sur le nouveau schéma. Il remplacera l'actuel après la bascule.
- Les commandes SQL du CLAUDE.md : promotion admin (`UPDATE players.accounts SET is_admin = true WHERE email = …`) et restauration.
- Les sauvegardes automatiques de la base (fil en cours) : rien à changer, c'est la même base ; vérifier seulement qu'elles couvrent tous les schémas et pas uniquement `public`.

---

## 9. Plan de développement

### 9.1 Principe : v1 et v2 côte à côte (décidé le 30/09)

- La v2 vit dans `src/v2/back` et `src/v2/front`, la v1 reste dans `src/back` et `src/front`.
- **La prod reste en v1 pendant tout le chantier :** les corrections urgentes continuent sur la v1.
- La CI construit et teste les deux. Les jobs v2 ne tournent que si `src/v2/**` change, pour ne pas doubler le temps de chaque run.
- Le staging passe en v2 dès que le socle tourne, dans la base `inseconds_staging` (schémas v2 à côté de la copie v1 dans `public`), avec les mêmes adresses `dev.inseconds.cc` et `api-dev.inseconds.cc`.
- **Alternative :** une branche longue de refonte. Elle est plus simple au début, mais les conflits avec les corrections de la v1 s'accumulent et le staging ne peut pas servir aux deux.

### 9.2 Règles de travail

- **Des PR courtes vers `env/staging`,** chacune avec tests, doc à jour et revue de code faite d'office. **Le staging devient celui de la v2** pendant tout le chantier (décidé le 30/09) : le déploiement staging construit `src/v2`.
- **v1 gelée** (décidé le 30/09) : plus aucune évolution, seulement des correctifs urgents, en PR **directement vers `main`** (la CI complète reste obligatoire, sans passage par le staging). Chaque correctif est noté dans `docs/TACHES` pour être reporté en v2.
- **Commits au nom de Clément** (author et committer), sans `Co-Authored-By`.
- **Les avertissements Sonar** sont traités dans la même PR.
- **Un piège du CLAUDE.md** qui concerne une slice réécrite garde son test, et la doc du piège est mise à jour pour pointer vers le nouveau code.

### 9.3 Étapes

Le découpage en PR, l'ordre et les jalons sont dans [DEVELOPPEMENT.md](DEVELOPPEMENT.md) (30/09), qui fait référence pour l'ordre de travail. Le tableau ci-dessous en est le résumé.

| # | Étape | Contenu | Terminée quand |
|---|---|---|---|
| 0 | Décisions | valider ce plan | go de Clément |
| 1 | Socle back | solution `src/v2/back`, `Program.cs` de composition, `InSecondsDbContext` (schémas, snake_case, `citext`), migration initiale vide, Wolverine (Http, codegen statique, transactions, outbox), Hangfire (schéma `jobs`, tableau de bord `/jobs`), `TimeProvider`/`GameCalendar`, format d'erreur, settings `jsonb`, `InSeconds.Infrastructure` (emails, OTel, réseau, rate limiting), `InSeconds.Api.Testing`, tests d'architecture, `/health` | build et tests verts en CI |
| 2 | Socle front | projet `src/v2/front`, `core`, `ui` (kit DA, modale, panneau, toasts), routes et redirections, table des erreurs, `withRequestStatus`, Sheriff, i18n par domaine | build, Vitest et Sheriff verts |
| 3 | CI et staging v2 | jobs v2 dans `ci.yml`, `docker-compose.staging.yml` v2, schémas v2 dans `inseconds_staging`, déploiement du socle sur `dev.inseconds.cc` | le staging répond en v2 (page vide mais saine) |
| 4 | Players | invités, cookie et appareils, magic link (outbox), changement d'email, pseudo, déconnexion, appareils ; front `account/` | E2E login, profil et changement d'email verts |
| 5 | Catalogue | `Track`, Deezer découpé, previews à 3 états, rang, recherche publique, tâche Hangfire `catalogue-refresh` ; front `admin/catalogue` | E2E admin pool verts |
| 6 | Gameplay | `TrackRound`, `FuzzyAnswerMatcher`, indices, `ISeededShuffle` ; front `gameplay/` (machine à états, `AudioPort`, saisie, révélation) | tests unitaires des pièges audio et de correction verts |
| 7 | Daily | défi, génération (nocturne, à la volée, admin), sessions, réponses, indices, abandon, reprise, série et gels, stats du jour, tâches Hangfire `daily-generate-challenge` et `daily-close-day`, stats figées et recalcul, stories hebdo ; front `daily/` | **tous les E2E du jeu verts sur la v2** |
| 8 | Admin | dashboard, défis, joueurs et historique, settings, lien vers le tableau de bord des tâches | **tous les E2E admin verts** |
| 9 | Import | `deploy/migration-v2/`, `InSeconds.MigrationTests`, workflow « Import v1 → staging v2 » | test de bout en bout du cookie vert, import staging sans écart |
| 10 | Recette sur le staging | imports répétés sur des copies prod fraîches, tests sur téléphone (iOS, Android), PWA, emails redirigés | 2 répétitions consécutives sans intervention manuelle |
| 11 | Bascule | § 10.2 | prod en v2, contrôles verts |
| 12 | Nettoyage | suppression de `src/back`, `src/front`, des jobs v1 et des tables v1 de `public` (après sauvegarde archivée) ; déplacement de `src/v2` à la racine de `src` ; doc | CI verte, doc à jour |
| 13 | Runs | module, front, E2E, dans la nouvelle architecture | décidé dans son fil |

Les étapes 4 à 8 peuvent se découper en plusieurs PR chacune (back, puis front, puis E2E). Chaque PR laisse le staging dans un état déployable.

### 9.4 Les E2E comme filet de sécurité

- Les specs Playwright sont **copiées** dans `src/v2/front/.../e2e` à l'étape 2, et pointées vers le back v2.
- Elles sont activées au fil des étapes : un spec désactivé est marqué comme tel dans une liste visible, jamais supprimé. La liste doit être vide avant la bascule.
- Tout changement d'un scénario (et non d'un simple sélecteur) doit être justifié dans la PR : c'est la garantie que le joueur ne voit pas de différence.

---

## 10. Staging, bascule en prod et retour arrière

### 10.1 Staging

- **Workflow manuel « Import v1 → staging v2 »** (`workflow_dispatch`, confirmation par saisie de `staging`) :
  1. copie les tables prod v1 dans `public` de `inseconds_staging` (le workflow « Copy prod DB to staging » existant, limité au schéma `public` pour ne pas toucher aux schémas v2) ;
  2. **anonymise d'abord les tables v1** avec le script existant (emails, `IsAdmin`, `AuthToken` régénérés, jetons et clés Data Protection supprimés) : les secrets de prod n'atteignent jamais les tables v2 du staging ;
  3. lance `run-import.sh` dans `inseconds_staging` ;
  4. repasse une anonymisation sur les tables v2, par sécurité (emails → `player-<id>@example.invalid` sauf `STAGING_KEEP_EMAIL`, `is_admin = false` sauf ce compte, `device_sessions`, `legacy_tokens`, `auth_tokens` et clés Data Protection vidés, file de messages `messaging` vidée) ;
  5. crée une clé Data Protection neuve (`--rotate-data-protection-key`, S16) puis redémarre l'API staging.
- **Chaque exécution est une répétition de la bascule** avec de vraies données. On la relance à chaque changement du modèle ou de l'import.
- **Recette manuelle :**
  - partie complète et reprise d'une partie en cours ;
  - série, gels et toasts ;
  - profil et appareils ;
  - admin (pool, défis, recalcul des stats, joueurs, stories) ;
  - emails redirigés ;
  - installation PWA sur téléphone.

### 10.2 Jour de la bascule

**Préparation (la veille) :**
- répétition générale sur le staging avec une copie prod fraîche ;
- schémas et tables v2 créés à l'avance dans `inseconds` par l'API v2 en mode « migration uniquement » (sans effet sur la v1) ; `.env.prod` inchangé côté base ;
- image v2 construite et prête ;
- créneau choisi au creux de trafic visible dans Grafana, **jamais entre 22 h 30 et 1 h UTC** (jobs de 23 h et de minuit, pic du soir).

**Déroulé :**

| Étape | Action | Durée indicative |
|---|---|---|
| 1 | Arrêt de l'API v1. Le front v1 affiche « Service indisponible » et se reconnectera seul. | immédiat |
| 2 | Workflow d'import en prod : import depuis `public`, vérification, clé Data Protection neuve (`--rotate-data-protection-key`, S16). **Au moindre écart : arrêt et redémarrage de la v1, sans aucun impact.** | quelques minutes |
| 3 | Déploiement de la v2 (API et front), même base ; Caddy envoie les mêmes adresses vers les nouveaux conteneurs ; vérification de santé du script de déploiement. | quelques minutes |
| 4 | Contrôles rapides : connexion avec un cookie existant, reprise d'une partie en cours, partie complète, admin, email de connexion. | 10 min |
| 5 | Surveillance Grafana (erreurs, 4xx inhabituels, jobs de la nuit suivante). | la journée et la nuit |

**Onglets restés ouverts :** pendant quelques semaines, les anciennes routes (`/api/sessions…`, `/api/stats/today`…) renvoient `410` avec le code `common.new_version`. L'ancien front l'affiche comme une erreur avec rechargement, et le nouveau front propose de recharger dès que `SwUpdate` détecte une nouvelle version (§ 6.6).

### 10.3 Retour arrière

- Les tables v1 de `public` ne sont **jamais modifiées** par la v2 et restent intactes plusieurs semaines.
- **Avant que des joueurs aient écrit dans la v2** (contrôles de l'étape 4 en échec) : redémarrer la v1 sur sa base. Aucune perte.
- **Après :** les parties jouées en v2 seraient perdues avec un retour arrière simple. D'où les contrôles rapides juste après la bascule. Au-delà de quelques heures, on corrige en avant plutôt que de revenir en arrière.
- Le script inverse (v2 → v1) n'est **pas** prévu : il coûterait cher pour un cas qu'on évite par les répétitions. À reconsidérer si Clément le souhaite.

---

## 11. Documentation, exploitation et nettoyage

- **CLAUDE.md racine et sous-dossiers** réécrits pour la v2 :
  - architecture, modules, règles de dépendance ;
  - modèle de données et commandes SQL (promotion admin, restauration) ;
  - pièges à jour : ceux qui n'ont plus lieu d'être sont retirés avec une ligne d'historique, les autres pointent vers le nouveau code.
- **README FR/EN, `docs/COMMENCE_ICI`, `docs/GAMEPLAY_RULES_*`** (règles inchangées, vérifiées), **`docs/TACHES`** (tâches v1 closes ou reportées).
- **`deploy/infra/README.md` :** rien à créer (même base, même utilisateur) ; documenter les schémas v2.
- **Dependabot :** chemins `src/v2` pendant le chantier, puis `src` ; `@ngrx/signals` dans le groupe `angular`.
- **SonarCloud :** exclusions mises à jour (clients NSwag générés, gabarits d'emails, code Wolverine généré).
- **Après la bascule :** suppression du code v1, des jobs CI v1, des anciennes routes de compatibilité (après quelques semaines), des tables v1 de `public` et de `public."__EFMigrationsHistory"` (après une sauvegarde archivée).

---

## 12. Risques et parades

| Risque | Parade |
|---|---|
| La v2 écrit par erreur dans une table v1 | le `DbContext` v2 ne mappe aucune table de `public`, vérifié par un test d'architecture ; les tables v1 sont sauvegardées avant la bascule |
| Une tâche de nuit qui tourne à la fois sur la v1 et sur la v2 | les tâches Hangfire n'existent que dans la v2, qui ne démarre qu'après l'arrêt de la v1 ; `[DisableConcurrentExecution]` sur chaque tâche |
| Des joueurs déconnectés à la bascule | clés Data Protection copiées, hash du jeton repris, middleware de transition v1 → cookie standard, test de bout en bout |
| Une série ou des gels faussés | vérification joueur par joueur, règles de série couvertes par les tests des pièges 18 et gels |
| Une partie en cours perdue | sessions `Pending` importées avec leur position ; vérification dédiée |
| Une régression visible par le joueur | tous les E2E v1 verts sur la v2 avant la bascule |
| Un job de nuit raté juste après la bascule | créneau hors 22 h 30 – 1 h UTC, génération à la volée gardée en secours, surveillance la première nuit |
| Les pièges audio réintroduits | `AudioPort` sur Howler.js (arrêt au palier fait par le navigateur), comportements v1 repris avec leurs tests (vrai Chromium, lanceur autoplay) |
| Un chantier trop long qui bloque les corrections | la v1 reste en prod et corrigeable ; PR courtes ; le staging reste déployable à chaque étape |
| Une double maintenance v1 + v2 trop coûteuse | ne corriger en v1 que l'urgent ; noter chaque correction v1 pour la reporter en v2 (liste dans `docs/TACHES`) |
| Le codegen statique de Wolverine qui dérive | génération vérifiée en CI (échec si le code généré n'est pas à jour) |
| Des rate limits trop bas ou mal dérivés derrière Cloudflare | mêmes politiques et même `TrustedProxyNetworks`, test d'intégration dédié |
| Une PWA qui sert une vieille version | stratégie de mise à jour par détection de version, `ngsw.json` et index en `no-cache`, vérifiés par `nginx-headers` |

---

## 12 bis. Sécurité : relecture du plan (30/09)

Relecture du plan sous l'angle des failles. Chaque point devient une exigence de l'étape indiquée, avec son test.

### Failles à combler (nouvelles avec la v2)

| # | Risque | Gravité | Parade | Étape |
|---|---|---|---|---|
| S1 | **Le lien magique en clair dans l'outbox.** Un message `SendMagicLinkEmail` qui contient le jeton brut est écrit dans `messaging` et y reste un moment : lire la base ou une sauvegarde suffirait pour se connecter à la place de quelqu'un, pendant 15 min. | haute | le message ne porte que l'email et l'objet de la demande ; **c'est son handler qui génère le jeton**, stocke son hash et envoie l'email. Un réessai produit un nouveau jeton, ce qui est sans danger. Rétention courte des messages traités. Test : aucune colonne de `messaging` ne contient un jeton après une demande. | 4 |
| S2 | **Jetons fusionnés dans `auth_tokens`.** Un jeton de changement d'email pourrait servir à se connecter, ou l'inverse. | haute | chaque vérification filtre sur `purpose` ; contrainte CHECK en base ; tests croisés (un jeton de connexion refusé par la confirmation d'email, et l'inverse). | 4 |
| S3 | **Le tableau de bord Hangfire exposé.** Sans configuration, il n'est accessible qu'en local ; mal configuré, il serait public et permettrait de lancer des tâches. | haute | `MapHangfireDashboard("/jobs").RequireAuthorization("Admin")` ; **Cloudflare Access sur le chemin `api.inseconds.cc/jobs`** en plus (comme pour `dev.inseconds.cc`) ; antiforgery d'ASP.NET activé pour ses actions ; test : 401 sans cookie, 403 pour un non-admin. | 1 |
| S4 | **Données personnelles dans les tables techniques.** Les arguments des tâches Hangfire et les messages Wolverine sont stockés en clair. | moyenne | aucune donnée personnelle dans les arguments de tâches (elles n'en ont pas besoin) ; messages Wolverine limités aux identifiants, plus l'email pour les envois ; rétention courte ; mêmes règles que la télémétrie. | 1 |
| S5 | **Fixation de session** à la connexion ou à la conversion invité → compte. | moyenne | à chaque connexion : nouvelle `device_session`, nouveau cookie, révocation de l'ancienne session invité de ce navigateur. | 4 |
| S6 | **Le cookie v1 accepté trop longtemps.** Le middleware de transition élargit la surface d'attaque tant qu'il existe. | moyenne | il n'accepte un cookie v1 que s'il retrouve son hash dans `legacy_tokens` ; le hash ne peut pas être à usage unique (en v1, tous les appareils d'un compte partagent le même jeton) ; retrait daté (J+90), inscrit dans `docs/TACHES`, table supprimée ensuite. | 4, 12 |
| S7 | **Secrets v1 laissés en base.** `public."Players"."AuthToken"` (en clair) et les anciennes tables restent quelques semaines après la bascule, y compris dans les sauvegardes. | moyenne | `AuthToken` v1 vidé seulement une fois la bascule validée, au plus tôt à J+1 (le vider plus tôt déconnecterait tout le monde en cas de retour arrière) ; tables v1 supprimées après la sauvegarde archivée ; sauvegardes chiffrées (rclone, décision du 28/09). | 11, 12 |
| S8 | **Des clés Data Protection de prod sur le staging** pendant la copie. | moyenne | ordre revu en § 10.1 : anonymisation des tables v1 **avant** l'import ; seconde anonymisation après. | 9 |
| S9 | **Les endpoints de test dans l'image de prod.** Un `/api/e2e/*` ou le dev-login en prod permettrait de tout effacer ou de se connecter en admin. | haute | `InSeconds.Api.Testing` absent de l'image de prod (vérifié en CI sur l'image construite) ; test d'architecture ; test de fumée après déploiement : `/api/e2e/reset` et `/api/auth/dev-login` renvoient 404. | 1, 3 |
| S10 | **Le service worker qui garde en cache des réponses de l'API** sur un appareil partagé, ou sert longtemps une version vulnérable. | moyenne | `ngsw-config.json` sans aucun `dataGroups` pour l'API (qui est de toute façon sur une autre origine) ; mise à jour proposée dès qu'une version est prête (`SwUpdate`) ; vérifié par le job `nginx-headers`. | 2, 10 |
| S11 | **Nouvelles routes sans limite de débit :** création d'invité, révocation d'appareils, demande de changement d'email. | moyenne | création d'invité dans la politique `PlayerCreation` existante ; autres routes par joueur ; test d'intégration pour chaque politique. | 4 |
| S12 | **Des détails internes dans les erreurs.** Messages d'exception dans les `ProblemDetails`. | faible | en prod et en staging, seulement `code`, `title` générique et `traceId` ; le détail reste dans les logs. Test : une 500 ne contient pas le message de l'exception. | 1 |
| S13 | **Données personnelles dans les logs de l'import.** | faible | les scripts ne sortent que des comptes et des identifiants, jamais d'email ni de pseudo. | 9 |

### Faiblesses existantes que la v2 est l'occasion de corriger

| # | Risque | Parade proposée | Étape |
|---|---|---|---|
| S14 | **Pas de `Content-Security-Policy` sur le front** (connu, cf. CLAUDE.md). | CSP d'abord en `Report-Only` sur le staging (origines de l'API, `*.dzcdn.net` pour les previews et pochettes, en `connect-src` aussi puisque Howler charge les extraits par `fetch`, Google Fonts si utilisé), remontée des violations vers `/api/client-errors`, puis CSP bloquante avant la bascule. | 2, 10 |
| S15 | **Aucun en-tête de sécurité sur l'API** (nginx ne sert que le front). | en-têtes posés par l'API : `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security` ; CSP `default-src 'none'` sur l'API, CSP stricte sur `/jobs` (scripts de `/jobs` seulement, styles en ligne permis pour Hangfire) — fait en A3. | 1 |
| S16 | **Clés Data Protection en clair en base :** avec la base ou une sauvegarde, on peut fabriquer un cookie valide pour n'importe quel joueur. | **Décidé le 30/09 :** `ProtectKeysWithCertificate`. Le certificat `.pfx` (auto-signé, 10 ans) est généré par Clément sur le VPS, rangé hors du dépôt (`~/apps/InSeconds/secrets/`) et monté en lecture seule dans l'API (`/run/secrets/dataprotection.pfx`) ; lisible par le seul utilisateur de l'image (uid/gid 1654) en plus de son propriétaire : `chgrp 1654` et `chmod 640` (décidé en A6 : en `600` avec `debian` pour propriétaire, l'API, qui tourne en uid 1654, ne pourrait pas le lire) ; son mot de passe est dans `.env.prod` (`DATA_PROTECTION_CERTIFICATE_PASSWORD`, même nom que dans `.env.staging`). Le staging a son propre certificat. `UnprotectKeysWithAnyCertificate` permet d'en changer. **Clé neuve à la bascule (décidé en B4) :** l'import copie les clés de la v1, en clair ; sans clé neuve, la plus récente deviendrait la clé par défaut de la v2. La commande `--rotate-data-protection-key` (`IKeyManager.CreateNewKey`, chiffrée par le certificat) est lancée juste après chaque import, avant le démarrage de l'API. Les anciennes clés en clair sont supprimées 90 jours après la bascule (tous les cookies ont été réémis). **Le certificat et son mot de passe sont sauvegardés hors de la base et hors de la sauvegarde R2** (gestionnaire de mots de passe) : les perdre ferait perdre leur identité aux invités. | 1 |
| S17 | ✓ **Fait le 30/09** par Clément : `cloudflare-only.sh apply` puis `install` (service au démarrage + timer quotidien), site vérifié. Reste à mettre à jour le CLAUDE.md (§ Durcissement serveur) et `docs/TACHES` dans la première PR. | — | avant 3 |
| S18 | **Les droits en base :** l'API utilise un utilisateur qui possède tout. | à la bascule, rien ne change ; ensuite, un utilisateur de migration distinct de l'utilisateur de l'API (sans `DROP` ni `CREATE` en fonctionnement normal). À évaluer, c'est un confort plus qu'une urgence. | après 12 |

### Ce qui est déjà solide et reste inchangé

- Magic link : jeton haché, 15 min, usage unique, bouton « Confirmer » explicite (piège 21), anti-CSRF par `Origin` (piège 22), pas de conversion d'un compte déjà lié (piège 30).
- Réponses jamais envoyées avant que le joueur ait répondu (piège 31) ; verrou du morceau en cours (piège 35).
- Rate limiting par IP réelle derrière Cloudflare et Caddy (pièges 27 et 34).
- Déconnexion effective côté serveur (révocation de l'appareil, piège 39 amélioré).
- Emails redirigés sur le staging, et refus de démarrer sans redirection.
- Aucune donnée personnelle dans la télémétrie.
- IP du VPS jamais dans le dépôt ; clé d'hôte SSH épinglée pour les déploiements.

### Tests de sécurité ajoutés au plan

- Une suite `SecurityTests` en intégration : toutes les routes `/api/admin/*` et `/jobs` refusent un non-admin (liste générée depuis les routes, pour qu'une route oubliée échoue), jetons croisés refusés, cookie révoqué refusé en moins d'une minute, pas de détail d'exception dans une 500.
- Un test de fumée après chaque déploiement (staging et prod) : endpoints de test absents, en-têtes de sécurité présents, `/jobs` protégé.

## 12 ter. Relecture complète : fonctionnel, architecture, données, exploitation (30/09)

Deuxième relecture, en comparant le plan au code v1 (`env/staging`). Les points déjà corrigés dans les sections concernées sont marqués ✓ ; les autres deviennent des exigences de l'étape indiquée.

**Fonctionnel et données**

| # | Constat | Gravité | Traitement | Étape |
|---|---|---|---|---|
| R1 | Tous les appareils d'un compte v1 partagent le même `AuthToken` : une seule `device_session` importée par joueur, effacée à la première conversion, aurait déconnecté les autres appareils. | haute | ✓ table `legacy_tokens`, une `device_session` par conversion, hash valable jusqu'à J+90, test « même cookie sur deux navigateurs » (§ 4.2, 5.5, 8.6). | 4 |
| R2 | Série et gels mis à jour par l'outbox alors que le récap les relit tout de suite : toasts manquants ou faux, risque de double gel. | haute | ✓ mise à jour dans la transaction de la complétion ; gel offert dans celle de la conversion (§ 5.2, 5.4). | 4, 7 |
| R3 | Stats de la veille figées à 0 h 05 alors qu'une partie de la veille peut encore se terminer. | haute | ✓ photo figée à J-2, veille en calcul direct (§ 5.4, 5.4 bis). | 7 |
| R4 | Un défi créé à la main ne met pas à jour le cooldown en v1 : la vérification de l'import aurait bloqué. | haute | ✓ sans objet : la création à la main n'a jamais eu d'écran (confirmé par Clément le 30/09) ; route abandonnée en v2, vérification du cooldown gardée stricte (§ 5.6, 8.3). | 9 |
| R5 | Pseudos uniques en respectant la casse en v1, `citext UNIQUE` en v2 : « Bob » et « bob » feraient échouer l'import. | haute | ✓ aucun doublon en prod (vérifié à la main par Clément le 30/09) ; le contrôle reste dans `20-verify.sql` au cas où un doublon apparaîtrait d'ici la bascule. Ajouter aussi des contraintes CHECK sur les longueurs (pseudo 3 à 20). | 9 |
| R6 | Retrait de `generate-today` et `refresh-previews` : l'admin perdait son compte rendu, les E2E cassaient ; `PoolInsufficient` vu comme un succès par Hangfire. | moyenne | ✓ boutons gardés, lancés par Hangfire avec suivi de l'exécution ; exception sur pool insuffisant, essais suffisants (§ 5.4 bis, 5.6). | 3, 7 |
| R7 | `GET /players/me` ne crée plus d'invité : `BrowserIdComponent` et la spec `streak-freeze` en dépendent. | moyenne | ✓ `POST /players/guest` d'abord (§ 5.6) ; BrowserId et les chips « toi » ajoutés à `admin/` (§ 6.5). | 4, 8 |
| R8 | Joueurs supprimés : en v1, un filtre EF les exclut partout ; en v2, Daily ne peut pas naviguer vers Players. | moyenne | les requêtes de stats de Daily joignent `players.players` (lecture seule, dans `Persistence`) sur `deleted_at IS NULL` ; test « un joueur supprimé disparaît des stats et de la répartition ». | 7 |
| R9 | Contenu de la photo figée incomplet, pseudo et titre figés = valeurs périmées après renommage. | moyenne | ✓ contenu v1 complet, paliers du jour stockés, pseudo et titre joints à la lecture (§ 5.4). | 7 |
| R10 | Paramètres Data Protection v1 (`SetApplicationName`, purpose) nécessaires pour lire les cookies v1. | moyenne | ✓ § 5.5. | 4 |
| R11 | Piège 37 : une erreur de base passagère ne doit jamais créer un nouvel invité. | moyenne | ✓ 500, jamais de rejet du cookie (§ 5.5). | 4 |
| R12 | Piège 14 : le cache des previews est borné par l'expiration de la signature CDN moins 1 h ; jamais de cache pour une preview absente ou une recherche vide. | moyenne | à reprendre tel quel dans le décorateur de `IPreviewProvider`, avec ses tests. | 5 |
| R13 | Les settings « à chaud » ne se relisent pas seuls avec `IOptionsMonitor`. | moyenne | rechargement explicite de la source après chaque écriture admin (`IConfigurationRoot.Reload()`), testé ; « à chaud » réservé aux clés sans effet sur une partie en cours (cooldown, gels). | 3 |
| R14 | `TokenHash` v1 en texte hexadécimal, `bytea` en v2. | faible | ✓ `decode(…, 'hex')` (§ 8.2). | 9 |
| R15 | Jointure du verrou en cours sans filtre sur le défi. | faible | ✓ § 8.4 ; sessions `Pending` passées couvertes par les tests (§ 8.6). | 9 |
| R16 | `COALESCE(now())` inventait des dates de suppression. | faible | ✓ § 8.2. | 9 |
| R17 | `last_seen_at` : deux mécanismes décrits, et « une fois par heure » dégradait l'onglet Joueurs. | faible | ✓ un seul endroit (`OnValidatePrincipal`), toutes les 5 min (§ 5.4, 5.5). | 4 |
| R18 | Avis « l'adresse a changé » (`from=legacy`, `LegacyUrlNoticeComponent`) absent du plan. | faible | repris dans le front v2 ; la redirection `/` → `/daily` garde la query string ; E2E dédié. | 8 |
| R19 | Pièges front non listés : 25 (heure de déploiement), 28 (filtre « artiste titre »), 41 (`stats/today` sans gestion d'erreur), 42 (souscription de la modale d'écoute). | faible | ajoutés à la liste « un piège, un test » du § 6.7. | 8 |
| R20 | Piège 24 : Workstation GC et `Size` obligatoire sur chaque entrée de cache. | faible | repris dans le csproj et le cache v2. | 1 |

**Architecture**

| # | Constat | Gravité | Traitement | Étape |
|---|---|---|---|---|
| A1 | Transactions automatiques et outbox derrière des stores : rien ne garantit que le store et l'outbox partagent la transaction. | moyenne | test d'intégration dès l'étape 1 (un message n'est envoyé que si la donnée est enregistrée, et inversement) ; `MapWolverineEnvelopeStorage` ; le schéma `messaging` créé par Wolverine au démarrage (les migrations EF ne peuvent pas le créer, constaté en A2). Fait en A2 : `OutboxTests`. | 1 |
| A2 | Les clés étrangères entre schémas contredisent la règle « pas de dépendance hors `Contracts` ». | moyenne | exception écrite pour `Persistence` : les FK entre modules sont déclarées en SQL dans la migration, `ON DELETE RESTRICT`, sans navigation EF. | 1 |
| A3 | Contradictions internes (outbox et série, `last_seen_at`, « un GET n'écrit jamais », date de build au lieu de `SwUpdate`). | faible | ✓ corrigées. | — |
| A4 | Hangfire : `RequireAuthorization` ne suffit pas, le filtre local par défaut reste actif. | faible | `DashboardOptions.Authorization = []` en plus de la policy, couvert par le test 401/403 de S3. | 1 |

**Exploitation, CI et bascule**

| # | Constat | Gravité | Traitement | Étape |
|---|---|---|---|---|
| E1 | Le déploiement automatique sur `main` pourrait démarrer la v2 sans import. | haute | la v2 ne passe sur `main` que par un workflow manuel « Bascule v2 » (`workflow_dispatch`) qui enchaîne arrêt v1, import, vérification, démarrage v2 ; mêmes noms de conteneurs (`inseconds.api`, `inseconds.front`) pour Caddy. | 11 |
| E2 | Relancer l'import en prod après l'ouverture effacerait les parties v2. | haute | ✓ marqueur `infra.import_state` et `--force` (§ 8.4). | 9 |
| E3 | Le mode « migration uniquement » pourrait démarrer Hangfire et Wolverine en prod à côté de la v1. | haute | ✓ point d'entrée `--migrate-only` testé (§ 8.4). | 1 |
| E4 | Retour arrière : vider les jetons v1 trop tôt déconnecterait tout le monde. | haute | ✓ S7 revu : pas avant J+1. | 11 |
| E5 | Le staging ne peut pas servir à la fois à la v2 et aux correctifs v1 (`env/staging` est écrasé par des `push -f`). | haute | ✓ décidé le 30/09 : le staging devient celui de la v2 ; les correctifs urgents v1 vont directement dans `main` (§ 9.2). | 3 |
| E6 | `citext` et la copie prod → staging (`pg_restore --clean` sur toute la base). | moyenne | ✓ extension dans `extensions` ; copie limitée à `pg_dump -n public` ; API staging arrêtée pendant l'import. | 9 |
| E7 | Base de test de forme v1 figée, qui dériverait. | moyenne | ✓ générée en CI + contrôle `information_schema` (§ 8.5, 8.6). | 9 |
| E8 | E2E copiés en v2 qui divergent de ceux de la v1. | moyenne | check CI qui compare les deux listes de tests (`playwright test --list`) ; tout écart doit être justifié. | 2 |
| E9 | CI filtrée par chemin fragile (jobs requis jamais lancés). | moyenne | `dorny/paths-filter` et un job agrégateur « CI OK », seul check requis. | 2 |
| E10 | Chantier sans estimation ni gel fonctionnel de la v1 ; Dependabot en double. | moyenne | ✓ décidé le 30/09 : v1 gelée, correctifs urgents seulement, reportés en v2 ; estimation à poser ; Dependabot : groupes v2 séparés, majeures v1 ignorées pendant le chantier. | 1 |
| E11 | Onglets v1 ouverts qui reçoivent un 410. | faible | ✓ § 10.2 ; message « nouvelle version, recharge » plutôt qu'une erreur générique. | 11 |
| E12 | PWA : pouvoir la désinstaller et ne pas gêner les E2E. | faible | `safety-worker.js` prêt à déployer en cas de problème ; `serviceWorkers: 'block'` dans Playwright. | 10 |

---

## 13. Points encore ouverts

1. **Le go de démarrage** (étape 1).
2. **Un script de retour arrière v2 → v1 :** non prévu par défaut (§ 10.3).
3. **Le nom définitif et les règles du mode Runs :** dans son fil, sans effet sur ce plan.
4. **Nettoyage récurrent des invités jamais revenus** (actuellement dans « À venir ») : faisable facilement en v2 (tâche Hangfire + `PlayerDeleted`), à décider séparément.
5. **Actions serveur pour Clément** (pas d'accès SSH pour Claude) : ~~certificats Data Protection staging et prod~~ faits le 30/09 (sauvegarde des .pfx dans le gestionnaire de Clément) ; ~~appliquer `cloudflare-only.sh` (S17)~~ fait le 30/09, puis créer l'application Cloudflare Access sur `api.inseconds.cc/jobs` (S3), avant la mise en ligne de `/jobs`.
6. ~~Staging pendant le chantier~~ : décidé le 30/09, le staging est la v2, correctifs v1 directement dans `main`.
7. ~~Pseudos en doublon de casse~~ : aucun en prod (vérifié par Clément le 30/09).
8. ~~Défis créés à la main~~ : sans objet, la fonction n'a jamais eu d'écran ; route abandonnée en v2.
9. ~~Gel de la v1~~ : décidé le 30/09, correctifs urgents seulement. **Reste l'estimation**, à poser au démarrage.

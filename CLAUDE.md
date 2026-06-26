# CLAUDE.md — InSeconds

Instructions pour Claude quand il travaille dans ce repo. Pour la documentation utilisateur, voir [README.md](README.md) / [README.fr.md](README.fr.md).

## Vue d'ensemble

InSeconds = blind test musical quotidien. N morceaux/jour (configurable via `TracksPerChallenge`, défaut 3), l'utilisateur choisit combien de secondes il écoute (paliers : 0.5, 1, 1.5, 2, 3, 5, 10) avant de tenter artiste + titre. Moins de temps écouté = plus de points. Même défi pour tout le monde, même jour. Mode guest dispo (joue sans s'inscrire, hors classement).

Stack : .NET 10 / Wolverine / EF Core / PostgreSQL côté back, Angular 20 / Tailwind v4 / SCSS côté front, Docker Compose pour back + DB. Hébergé sur **Northflank** (front + back + PostgreSQL addon).

## Ports (ATTENTION — non standards)

| Service | Port |
|---------|------|
| Frontend (`ng serve`) | **5173** (PAS 4200 — conflit avec Screlec/TimeTracker) |
| Backend API | **5171** (mappé depuis `:8080` interne au conteneur) |
| PostgreSQL | **5432** |

Tous les ports InSeconds en `51xx` par convention. Si tu modifies un port, propage partout : `angular.json` (front), `appsettings.json` (CORS), `docker-compose.yml`, READMEs.

## Structure repo

```
InSeconds/
├── docker-compose.yml         # services database + api
├── docker-compose.dcproj      # intégration VS (F5 lance le compose)
├── docs/                      # docs d'archi (FR), source de vérité conceptuelle
│                              # ⚠️ certains détails sont obsolètes — vérifier le code
├── src/
│   ├── back/
│   │   ├── InSeconds.slnx              # solution .NET (FORMAT .slnx OBLIGATOIRE)
│   │   ├── global.json                 # rollForward: latestFeature sur .NET 10
│   │   ├── InSeconds.Api/              # web API
│   │   ├── InSeconds.Api.UnitTests/    # tests unitaires xUnit (ScoreCalculator, TextNormalizer, SettingsService)
│   │   └── InSeconds.Api.IntegrationTests/ # tests d'intégration (Testcontainers + WebApplicationFactory)
│   └── front/
│       └── InSeconds.Client/  # app Angular
└── README.md / README.fr.md
```

## Architecture backend — vertical slice

Une **feature = un dossier** dans `Features/<Aggregate>/<UseCase>/` contenant : `Endpoint.cs` (Minimal API), `Command.cs`/`Query.cs`, `Handler.cs` (Wolverine), `Validator.cs` (FluentValidation), `Response.cs`.

Layout fixe :
```
InSeconds.Api/
├── Features/<Aggregate>/<UseCase>/   # 1 dossier = 1 use-case complet
├── Domain/                            # entités EF pures (pas d'annotations)
├── Infrastructure/
│   ├── Persistence/
│   │   ├── ApplicationDbContext.cs
│   │   ├── Configurations/            # 1 IEntityTypeConfiguration<T> par entité
│   │   └── Migrations/
│   └── Deezer/                        # client API Deezer
├── Common/
│   ├── Auth/                          # CookieAuthService + PlayerAuthMiddleware
│   ├── Scoring/                       # ScoreCalculator
│   ├── Settings/                      # AppSettings, SettingsService, AppDbConfigurationSource
│   └── Text/                          # TextNormalizer (Levenshtein)
└── Program.cs
```

### Règles dures (ne pas dévier)

- **Pas de couche service partagée fourre-tout** — chaque feature porte sa logique
- **Pas d'abstraction `IRepository<T>`** — `ApplicationDbContext` est injecté directement dans les handlers
- **Wolverine handlers par convention** (méthodes nommées `Handle`, pas d'interface à implémenter)
- **Validation = FluentValidation par command** (pas DataAnnotations)
- **Endpoints = Minimal API**, un fichier par endpoint avec `MapXxx(this IEndpointRouteBuilder)`
- **SOLID s'applique aux services Common** (DI, interfaces seulement si besoin de mock)

### Wolverine — détail important

Wolverine 6.x **ne ship plus le compilateur runtime**. Il faut soit `WolverineFx.RuntimeCompilation` + `opts.UseRuntimeCompilation()` (notre choix, dev-friendly), soit static codegen pré-généré pour la prod. Ne pas retirer le package `WolverineFx.RuntimeCompilation` sans alternative.

### Settings — IConfigurationProvider + IOptions

Les settings (table `Settings` en BD) sont chargés via `AppDbConfigurationSource` / `AppDbConfigurationProvider` : au démarrage, une connexion ADO.NET brute lit la table et injecte les valeurs dans `IConfiguration` sous le préfixe `AppDb:`. L'auto-binding `IOptions<AppSettings>` fait le reste.

**Ajouter un nouveau setting = deux changements seulement :**

1. Une propriété dans `AppSettings` avec sa valeur par défaut :
   ```csharp
   public int MaxDailyPlays { get; set; } = 5;
   ```
2. Une migration EF qui insère la ligne dans `Settings` (`InsertData`).

Types scalaires (`int`, `string`, `bool`) sont bindés automatiquement par le framework. Pour `decimal[]` ou `Dictionary<decimal,int>`, ajouter une entrée dans `AppSettingsPostConfigure`.

**Ne pas écrire** de méthode `From()`, `ParseXxx()`, ou de champ `Default` — l'ancienne approche a été supprimée.

`SettingsService` est un simple wrapper `IOptions<AppSettings>` (singleton, calculé une fois au démarrage) :
```csharp
public sealed class SettingsService(IOptions<AppSettings> options)
{
    public Task<AppSettings> GetAsync(CancellationToken ct = default)
        => Task.FromResult(options.Value);
}
```

## Architecture frontend

Angular 20 standalone + signals.

- `src/app/app.config.ts` : `provideHttpClient(withFetch(), withInterceptors([playerAuthInterceptor, adminAuthInterceptor]))`, router, `provideAppInitializer` pour `SettingsService`, `ApiClient` enregistré avec token `API_BASE_URL → environment.apiUrl`
- `src/app/core/interceptors/player-auth.interceptor.ts` : ajoute `withCredentials: true` sur toutes les requêtes `/api` sauf `/api/admin`
- `src/app/core/interceptors/admin-auth.interceptor.ts` : injecte `Authorization: Bearer admin-token` sur toutes les requêtes `/api/admin` (token stocké en localStorage sous `admin_token`)
- `src/app/core/services/settings.service.ts` : charge les `Settings` BD au démarrage, expose des signals (`allowedDurations`, `guessTimerSeconds`, etc.)
- `src/app/core/models/game.models.ts` : re-exports depuis `api.generated.ts` (`TrackSlot`, `StartSessionResponse`, `SubmitAnswerRequest`, `SubmitAnswerResponse`)
- `src/app/api/api.generated.ts` : **fichier généré commité volontairement** (le backend ne tourne pas en CI), regénérer avec `npm run generate-api` après tout changement d'endpoint back puis commiter
- `src/environments/environment{,.development}.ts` : `apiUrl`, swap auto via `fileReplacements` dans `angular.json`
- `src/styles.scss` : `@use "tailwindcss";` (PAS `@import` — déprécié Sass 3)
- `.postcssrc.json` : plugin `@tailwindcss/postcss`
- **CORS** : le back autorise `http://localhost:5173` et `https://p01--front--b5cnx77tvxgb.code.run` dans `appsettings.json` (`Cors:AllowedOrigins`)

### NSwag — génération du client TypeScript

`nswag.json` à la racine du projet front pointe sur `/openapi/v1.json` du backend et génère `src/app/api/api.generated.ts` (classe `ApiClient` + tous les types DTO).

```bash
# Regénérer après un changement d'endpoint ou de DTO back :
docker compose up -d          # s'assurer que le back tourne avec le nouveau code
cd src/front/InSeconds.Client
npm run generate-api           # runtime Net100 obligatoire
npm run build                  # vérifier que le build passe
```

`api.generated.ts` **est commité** (le backend ne tourne pas en CI, donc la génération ne peut pas s'y faire automatiquement). Après toute regénération locale, commiter le fichier mis à jour. `game.models.ts` re-exporte les types utilisés par `GameService` et les composants.

## Modèle de données (7 tables)

| Table | Rôle |
|-------|------|
| `Players` | `Guid Id`, `IsGuest`, `Pseudo?`, `AuthToken` (cookie HttpOnly), soft-delete (`IsDeleted`), CHECK constraint guest⇔pseudo |
| `Tracks` | référentiel canonique (DeezerTrackId unique), `CoverHash` = hash seul de l'image Deezer (pas l'URL complète), `HasPreview` = flag mis à jour nuitamment par `RefreshPreviewStatusService` |
| `DailyChallenges` | 1 par jour UTC (Date unique) + Seed pour audit |
| `DailyChallengeTracks` | jonction Track ↔ Challenge + Position (1-10) + DeezerRankSnapshot |
| `GameSessions` | 1 entrée/joueur/jour (unique sur `PlayerId+DailyChallengeId`), `Status` (Pending=0/Completed=1/Abandoned=2), `CompletedAt`/`AbandonedAt` nullable, index leaderboard + index `(ChallengeId, Status)` |
| `GameSessionAnswers` | 1 réponse par track, `ListenedDurationSeconds` (palier choisi), `WasExtended`, `ArtistCorrect`/`TitleCorrect` séparés |
| `Settings` | config key/value modifiable à chaud (timer saisie, paliers, template URL pochette, etc.) |

### Conventions modèle

- **`Player.Id` = Guid** (pas int, URL-safe), reste des entités = `int`
- **Soft delete sur Player uniquement** via query filter EF (`!IsDeleted`) propagé en cascade aux sessions/answers
- **Anti-rejeu** : contrainte unique `(PlayerId, DailyChallengeId)` sur `GameSessions`. `Completed` ou `Abandoned` → 409. `Pending` → reprise avec `IsResuming=true`
- **`SessionStatus`** : `Pending` = en cours (reprendre possible), `Completed` = terminée (N morceaux répondus), `Abandoned` = abandonnée (bouton ou expiry paresseuse minuit)
- **Scoring partiel** possible : `ArtistCorrect` et `TitleCorrect` séparés (pas un seul `IsCorrect`)
- **Durée écoutée = choix discret**, pas une mesure. Paliers dans `Settings.AllowedDurationsSeconds`
- **Migration auto** au boot via `db.Database.Migrate()` dans `Program.cs`
- **`Track.CoverHash`** : stocke uniquement le hash de l'image Deezer (ex: `abc123...`). L'URL complète est reconstruite à la volée via `AppSettings.BuildCoverUrl(hash)` en utilisant le template `CoverUrlTemplate` depuis `Settings`. Format Deezer : `https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg`

### Settings en base (valeurs par défaut)

| Key | Valeur par défaut | Type |
|-----|-------------------|------|
| `GuessTimerSeconds` | `20` | `int` |
| `AllowedDurationsSeconds` | `0.50,1,1.5,2,3,5,10` | `decimal[]` (CSV) |
| `MaxExtensionsPerAnswer` | `1` | `int` |
| `TracksPerChallenge` | `3` | `int` |
| `DurationScores` | `0.50:1000,1:850,1.5:700,2:550,3:400,5:250,10:100` | `Dictionary<decimal,int>` |
| `CoverUrlTemplate` | `https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg` | `string` |

## Commandes courantes

```bash
# Démarrer le stack back (DB + API hot-reload)
docker compose up -d

# Logs API
docker logs inseconds.api --tail 50

# Lancer le front
cd src/front/InSeconds.Client && npm start

# Régénérer une migration EF (depuis src/back/InSeconds.Api)
dotnet ef migrations add <Name> --output-dir Infrastructure/Persistence/Migrations

# Appliquer manuellement (normalement auto au boot API)
dotnet ef database update

# Build .NET
dotnet build src/back/InSeconds.slnx

# Lancer les tests unitaires
dotnet test src/back/InSeconds.Api.UnitTests

# Lancer les tests d'intégration (nécessite Docker)
dotnet test src/back/InSeconds.Api.IntegrationTests

# Recréer les conteneurs (si docker compose restart pose souci, ex helper VS injecté)
docker compose down && docker compose up -d

# Lancer les tests E2E (resets Docker, démarre back Testing + front e2e)
# depuis la racine du repo (VSCode task ou ligne de commande)
powershell -File scripts/run-e2e.ps1

# Ou depuis src/front/InSeconds.Client (si back déjà lancé en Testing)
npm run e2e
npm run e2e:ui   # mode UI interactif Playwright
```

## Conventions Git

- **Pas de `Co-Authored-By: Claude` dans les commits**, jamais
- Préférer commits atomiques, messages clairs (FR ou EN, peu importe)
- Branche principale dev : `feat/DevX` (incrémentée à chaque cycle). Cible des PR : `main`

## CI / GitHub Actions

Workflow `.github/workflows/ci.yml`, déclenché sur **push toutes branches + PR vers `main`**, avec `cancel-in-progress` pour annuler les runs obsolètes :

- **Job `back`** : restore + `dotnet build InSeconds.slnx --configuration Release` + `dotnet ef migrations has-pending-model-changes` (fail si une modif `Domain/` ou `Configurations/` n'a pas de migration associée)
- **Job `unit-tests`** : `dotnet test` sur `InSeconds.Api.UnitTests`
- **Job `front`** : `npm ci` + `npm run build` (prod) sur `src/front/InSeconds.Client/`
- **Job `integration-tests`** : tests d'intégration backend (dépend de `back`). Testcontainers crée un conteneur PostgreSQL real ephémère, `WebApplicationFactory<Program>` monte l'app in-memory en mode `Testing`, Respawn truncate les tables entre les tests. Build en **Debug** (pas Release).
- **Job `e2e`** : tests Playwright E2E (dépend de `back` + `unit-tests` + `front`). Tourne sur `ubuntu-latest` avec un service PostgreSQL (base `inseconds_e2e`). Lance le back en mode Testing sur le port 5171 avec `--no-launch-profile`, attend que `/api/settings` réponde, démarre Angular avec `ng serve --configuration e2e-ci`, puis exécute `npx playwright test`. Upload le rapport HTML en artifact en cas d'échec.

Runners Ubuntu, ~5-7 min par run (jobs `back`/`front`/`integration-tests` en parallèle, `e2e` séquentiel après). Setup .NET via `global-json-file: src/back/global.json` pour respecter le pin SDK du projet.

### Règles importantes pour la CI

- **Toujours regénérer la migration EF** après une modif d'entité ou de configuration, sinon le job `back` casse
- **Ne pas committer si le build front prod échoue** localement (`npm run build` doit passer)
- **Tests E2E** : le job `e2e` lance Playwright contre un back en mode `Testing` (FakeDeezerHandler + seed auto + endpoint `/api/e2e/reset`). Temps ~4-6 min.
- **Tests d'intégration** : le job `integration-tests` utilise Testcontainers (Docker requis sur le runner — GitHub Actions ubuntu-latest l'a par défaut). Pas de `services:` YAML nécessaire. Les tables `Settings`, `Tracks`, `DailyChallenges`, `DailyChallengeTracks` sont exclues du reset Respawn (données de référence du seed).
- Si un job casse sur du formatage / lint (futur `dotnet format` ou `ng lint`), corriger en local avant de re-pusher — ne pas désactiver le check
- Repo sur `Oasis35/InSeconds` (GitHub). Tier gratuit : 2000 min/mois si privé, illimité si public

## Conventions .NET

- **Solutions au format `.slnx`** (jamais `.sln` classique). Créer avec `dotnet new sln --format slnx`
- **`global.json` avec `rollForward: latestFeature`** pour accepter tout SDK 10.0.x
- Cibler `net10.0`, nullable + implicit usings activés

## Pièges connus

1. **Helper Visual Studio dans le conteneur API** — si VS lance le compose via `.dcproj`, il injecte `dotnet /VSTools/DistrolessHelper/DistrolessHelper.dll --wait` comme PID 1, l'API ne démarre pas. Fix : `docker compose down && docker compose up -d` recrée avec notre ENTRYPOINT.
2. **Healthcheck PostgreSQL** — utiliser `pg_isready` dans le conteneur. SQL Server n'est plus utilisé (migration vers PostgreSQL effectuée).
3. **Hot-reload dans le conteneur sur Windows** — nécessite `DOTNET_USE_POLLING_FILE_WATCHER=1` (déjà dans le Dockerfile) car les events fichiers ne traversent pas les bind mounts Linux/Windows.
4. **CORS** — quand on change le port front, mettre à jour `appsettings.json` côté back PUIS `docker compose restart api` ou recréer.
5. **Auth admin cross-domain** — le cookie `SameSite=None` est bloqué par Chrome en cross-site. L'auth admin utilise `Authorization: Bearer admin-token` + `localStorage` à la place. Le secret `AdminPassword` doit être configuré dans Northflank (variable d'env `AdminPassword` sur le service api).
6. **`Results.Forbid()` nécessite `AddAuthentication()`** — si l'app n'enregistre pas l'auth middleware ASP.NET, `Results.Forbid()` lève une `InvalidOperationException` au runtime. Utiliser `Results.StatusCode(403)` à la place.
7. **Cookie joueur cross-origin (Northflank)** — front et back sont sur des sous-domaines différents. Le cookie doit être `SameSite=None; Secure=true` en prod (déjà configuré dans `CookieAuthService`).
8. **`AppDbConfigurationProvider` silencieux si DB absente** — le `catch` dans `Load()` est intentionnel : en test (in-memory EF) ou lors de la première migration, la BD peut ne pas exister. Les initialiseurs de propriété d'`AppSettings` servent alors de fallback.
9. **E2E — `launchSettings.json` overrides env vars** — `dotnet run` sans `--no-launch-profile` charge le profil `http` qui force `ASPNETCORE_ENVIRONMENT=Development`, ignorant la variable CI. Toujours utiliser `--no-launch-profile` pour les runs E2E/Testing.
10. **E2E — proxy Angular port** — la config `e2e` (locale) pointe vers le back sur `:5172`, la config `e2e-ci` (CI) vers `:5171`. Ne pas confondre les deux.
11. **Tests d'intégration — Docker requis** — Testcontainers crée un conteneur PostgreSQL réel. Docker doit tourner localement (`docker info` doit répondre). En CI, GitHub Actions `ubuntu-latest` fournit Docker nativement — pas de `services:` YAML à configurer. xUnit v3 : `IAsyncLifetime.DisposeAsync()` retourne `ValueTask`, pas `Task` (implémentation explicite de l'interface obligatoire).
12. **Tests d'intégration — cookie cross-test** — `HttpClient` de `WebApplicationFactory` gère les cookies automatiquement (CookieContainer). Chaque `factory.ResetAsync()` vide les sessions/players, mais le cookie du test précédent peut être réutilisé si le player n'est pas supprimé. Le reset Respawn supprime les players, donc le prochain appel `POST /api/sessions` crée un nouveau guest.

## Déjà implémenté (non exhaustif)

- Vertical slices `Sessions/StartSession` + `Sessions/SubmitAnswer` (scoring serveur + stats par morceau)
- `SubmitAnswerResponse` inclut : `AverageSecondsWhenCorrect` (moy. temps des joueurs ayant trouvé) + `FailureRatePercent` + `ListenedDurationSeconds`
- Services Common : `TextNormalizer` (Levenshtein + suppression parenthèses/crochets), `ScoreCalculator`, `SettingsService` — tous couverts par tests unitaires xUnit (`InSeconds.Api.UnitTests`)
- `CookieAuthService` — résout ou crée un Player guest, cookie HttpOnly signé (`SameSite=None` en prod)
- `playerAuthInterceptor` Angular — `withCredentials: true` sur toutes les requêtes `/api` hors admin
- `DeezerClient` — `GetPreviewUrlAsync` + `SearchTracksAsync`, extrait le hash de pochette (`CoverHash`)
- `GET /api/deezer/search?q=xxx` — endpoint proxy public qui relay vers l'API Deezer (évite les CORS)
- Page admin (`/admin`) — login, création de défis, recherche Deezer, reset sessions du jour ; heure de déploiement affichée sous le titre (générée au `prebuild` via `scripts/generate-build-info.mjs` → `src/app/core/build-info.ts`, ignoré par git) ; stats par défi et historique défis paginés par mois (navigateur ‹ Mois Année › partagé entre onglet Dashboard et onglet Défis)
- Auth admin via Bearer token + `adminAuthInterceptor` Angular
- Settings chargés depuis la BD via `AppDbConfigurationSource` (ADO.NET brut) → `IOptions<AppSettings>`
- `Track.CoverHash` (hash seul, pas URL complète) + `AppSettings.CoverUrlTemplate` pour la reconstruction
- NSwag : `ApiClient` généré depuis `/openapi/v1.json`, enregistré dans `app.config.ts`, types re-exportés via `game.models.ts`, `api.generated.ts` commité
- Pages d'erreur : 404 (`NotFoundComponent`), "déjà joué" (409 → compte à rebours jusqu'à minuit UTC + stats), "pas de défi" (503)
- Récap final : lien Deezer par morceau (`deezerTrackId` inclus dans `TrackSlot`), badge officiel "À écouter sur Deezer" (`DeezerBadgeComponent`)
- `GET /api/stats/today` — score du joueur, médiane joueurs, taux d'échec + moyenne d'écoute par morceau (PostgreSQL `PERCENTILE_CONT(0.5)`). `TrackStat` inclut les champs joueur `ArtistCorrect`/`TitleCorrect`/`ListenedDurationSeconds` (nullable — null si pas de session complétée pour ce joueur)
- Écran "déjà joué" : ton score vs médiane joueurs, accordéon par morceau (pochette + badge Deezer), compte à rebours jusqu'à minuit UTC, bouton "🔗 Partager mon score" (visible uniquement si session `Completed`, càd `yourScore != null`)
- `ListenedDurationSeconds` et `TotalDurationSeconds` en `decimal` (paliers décimaux, ex: 0.5s)
- Déploiement Northflank (front + back + PostgreSQL), CI/CD auto sur push `main`
- **UX blind round** : layout B (zone player / zone saisie toujours visibles, pas de clignotement), bouton unique Stop/Replay, barre de progression live (`requestAnimationFrame`), autocomplete Deezer sur champ unique `"Artiste - Titre"`
- **Page d'accueil** : état `welcome` avant `playing` — session chargée en background, bouton "Commencer à jouer"
- **Favicon** : note Deezer blanche sur fond violet (`favicon.svg`)
- **`TextNormalizer`** : supprime les parenthèses/crochets avant comparaison (ex: `(feat. X)`, `[Radio Edit]`)
- **Préchargement audio** : `AudioPlayerService.preloadAll()` injecte des `<link rel="preload" as="audio">` pour tous les morceaux dès que la session est reçue — non bloquant, le jeu passe directement en état `welcome`
- **`GET /api/auth/me`** — retourne `{ id, isGuest, pseudo }` pour le joueur courant (cookie)
- **`GET /api/settings`** — expose les settings publics (paliers, timer, scores) consommé par `SettingsService` Angular au boot
- **`BackgroundService` génération défi quotidien** — `GenerateDailyChallengeService` s'exécute à 3h UTC. Retourne `GenerateResult` (`Success` / `AlreadyExists` / `PoolInsufficient`). La sélection utilise **Fisher-Yates** (seed = `today.DayNumber`) — même défi pour tous, distribution uniforme sans biais positionnel. Les deux `SaveChangesAsync` sont dans une transaction explicite.
- **`BackgroundService` refresh preview** — `RefreshPreviewStatusService` s'exécute à 2h UTC (avant la génération). Appelle Deezer pour tous les tracks disponibles (hors "used"), met à jour `Track.HasPreview` uniquement si le flag a changé. Délègue à `PreviewStatusRefresher` (scoped).
- **`Track.HasPreview`** : flag persisté en base (migration `AddTrackHasPreview`, défaut `true`). Initialisé à l'ajout (`AddTrackHandler`) et à l'actualisation (`UpdateTrackHandler`) depuis la réponse Deezer. `GetTracksHandler` lit ce flag directement — plus d'appel Deezer au chargement du pool admin. `DailyChallengeGenerator` filtre `t.HasPreview` en DB — plus d'appel Deezer à la génération.
- **`POST /api/admin/generate-today`** — retourne `200 OK`, `409 already_exists`, ou `422 pool_insufficient` (pool insuffisant, distinct du défi déjà existant). Le front affiche un message orange spécifique pour `pool_insufficient`.
- **Streak joueur** : `Player.CurrentStreak` + `Player.LastPlayedDate` (migration `PlayerStreak`), mis à jour dans `SubmitAnswer/Handler.cs` à la complétion (parties complètes uniquement), affiché sur l'écran récap final et l'écran "déjà joué"
- **Morceaux sans preview** : `SubmitAnswerValidator` accepte `ListenedDurationSeconds = 0` (skip), `BlindRoundComponent` affiche un bouton "Passer" si `previewUrl` est vide.
- **`GET /api/admin/stats?date=yyyy-MM-dd`** — dashboard admin : KPIs du jour sélectionné (`DailyKpisDto` : complétés, abandons, taux de complétion, score médian), activité 30 jours (tous les jours remplis, jours vides = 0), liste des dates disponibles (`AvailableDates`), répartition joueurs guests/inscrits/actifs, stats par défi (médiane, moy., min/max score, taux artiste/titre par morceau). Paramètre `date` optionnel, défaut = aujourd'hui. Jours passés : Pending comptés comme Abandoned dans les KPIs.
- **Page admin — Pool** : tableau paginé (15 lignes/page), filtres combinables (texte artiste/titre, statut Disponible/Utilisé, preview OK/Manquante), indicateur preview (vert/rouge) via `TrackDto.HasPreview` (lu depuis `Track.HasPreview` en DB — stable au rechargement, plus d'appel Deezer temps réel), sélection multiple + suppression en lot, popup d'ajout avec recherche Deezer + lecteur preview 30s + boutons "Ajouter" / "Ajouter et fermer", bouton "↻ Actualiser" ouvre la modale pré-remplie avec artiste + titre (met à jour `HasPreview` immédiatement en base)
- **`DELETE /api/admin/tracks/{id}`** — suppression d'un morceau du pool depuis la page admin (checkbox + corbeille individuelle, sélection multiple, modale de confirmation) ; interdit si utilisé dans un défi (409) ; 404 si introuvable
- **`PUT /api/admin/tracks/{id}`** — actualisation d'un morceau sans preview : bouton "↻ Actualiser" ouvre la modale en mode update, écrase `DeezerTrackId`/`Artist`/`Title`/`CoverHash` ; interdit si utilisé dans un défi (409) ; 409 si nouveau DeezerTrackId déjà pris ; 422 si introuvable sur Deezer
- **Tests d'intégration backend** (`InSeconds.Api.IntegrationTests`) : Testcontainers.PostgreSql + `WebApplicationFactory<Program>` + Respawn. 71 tests couvrant `StartSession`, `SubmitAnswer`, `AbandonSession`, `Stats/Today` (dont champs joueur `ArtistCorrect`/`TitleCorrect`/`ListenedDurationSeconds` dans `TrackStat`), `AdminStats`, `Auth/Me`, `SessionEdgeCases`, `ChallengeGeneration`, `Admin/Tracks` (DeleteTrack, UpdateTrack). Tournent en mode `Testing` (FakeDeezerHandler + seed auto). Job CI `integration-tests` séparé.
- **Partage score** : bouton "🔗 Partager mon score" sur l'écran récap final ET sur l'écran "déjà joué" (si session `Completed`) — copie dans le presse-papier un résumé `✅/❌` par morceau (`✅` = trouvé, `❌` = raté, daltonien-friendly) + durée + score total + lien `/blindtest`. Bouton désactivé (`disabled`) tant que tous les résultats ne sont pas revenus du serveur (fix race condition HTTP dernier morceau).
- **Route `/blindtest`** — alias de `/`, utilisée dans les liens de partage et les balises Open Graph
- **Open Graph + Twitter Card** dans `index.html` — balises méta pour le partage WhatsApp/Signal/Twitter (sans image)
- **`environment.appUrl`** dans les fichiers d'environnement Angular (prod : URL Northflank, dev : `http://localhost:5173`) — utilisé pour le lien de partage
- **Tests E2E Playwright** : 13 tests jeu + 12 tests admin. Jeu : happy path (3 morceaux), écran "déjà joué" (409 Completed → récap score + bouton partage avec emojis ✅/❌), bouton partage écran "déjà joué" (clipboard contient ✅/❌), abandon mid-game (409 → message abandon), reprise (Pending → écran "Partie en cours" → Reprendre → morceau 2), abandon depuis reprise, pas de défi (503), partage fin de partie (clipboard, emojis ✅/❌ uniquement), scoring (palier court vs long, mauvaise réponse, scoring partiel). Admin (`e2e/specs/admin.spec.ts`, page object `AdminPage`) : login (erreur, succès, déconnexion), pool (tableau, filtre texte, filtre preview, filtre statut), ajout morceau, suppression individuelle + annulation, actualisation morceau sans preview (modale pré-remplie), actions (générer défi, déjà généré, reset sessions), liste défis
- **`SessionStatus`** (Pending/Completed/Abandoned) : session comptabilisée seulement si complète ou explicitement abandonnée. `StartSession` retourne `IsResuming=true` + `completedAnswers` si session Pending. Expiry paresseuse : Pending de la veille → Abandoned au prochain StartSession. Stats/leaderboard filtrés sur `Completed`. Dashboard admin affiche `pendingCount` + `abandonedCount`
- **`PUT /api/sessions/{id}/abandon`** — `AbandonSession` endpoint (slice complète Endpoint+Command+Handler)
- **Bouton Abandonner** dans le template `game.component.ts` — mid-game + écran resume_prompt ; confirmation inline ; appel `game.service.ts#abandonSession()`
- **`ASPNETCORE_ENVIRONMENT=Testing`** : `FakeDeezerHandler` (retourne preview URL locale `test-audio.mp3` pour tous les IDs sauf IDs >= `9_000_000_000` → `preview: ""` pour simuler l'absence de preview), `PurgeSeedData` au démarrage, endpoint `DELETE /api/e2e/reset` + `POST /api/e2e/reseed` (auth admin requise)
- **Cookie `SameSite=Strict; Secure=false`** en Testing (HTTP local), `SameSite=None; Secure=true` en prod
- **Seed données dev/test dans `E2EResetEndpoint.SeedData()`** — 55 morceaux (dont 5 sans preview : IDs >= `9_000_000_000`, forcés KO par `FakeDeezerHandler` en Testing / 404 Deezer réel en dev) + défis J-2/J-1/aujourd'hui + joueur dev. Appelé au démarrage si `IsDevelopment() || IsEnvironment("Testing")` et `!db.Tracks.Any()`. Ne jamais mettre de données de référence dans les migrations EF (elles s'appliquent en prod aussi).

## À venir (pas encore implémenté)

- Tests mobiles (iOS Safari, Android Chrome)
- Polish : charte graphique, messages d'erreur, accessibilité, RGPD
- **Cache Redis pour les preview URLs Deezer** : les URLs sont identiques pour tous les joueurs du même défi. Intercaler dans `StartSession/Handler.cs` au niveau du `Task.WhenAll()` — chercher d'abord dans Redis (clé = DeezerTrackId, TTL 24h), sinon appeler Deezer. Nécessite `StackExchange.Redis` + entrée Redis dans `docker-compose.yml`.

## Décisions d'architecture notables

- **Pas de Register / Leaderboard** — fonctionnalité délibérément écartée pour garder l'app simple (tout le monde joue en guest, stats globales suffisent)
- **`UpdateData` EF insuffisant pour les Settings existants** — utiliser `migrationBuilder.Sql("UPDATE ...")` dans les migrations qui modifient des valeurs de Settings déjà en DB, sinon la mise à jour ne s'applique pas sur une DB prod existante
- **Autocomplete Deezer via proxy back** — l'API Deezer publique bloque les appels CORS directs depuis le navigateur. Le back expose `GET /api/deezer/search` qui relay (`DeezerClient.SearchTracksAsync`). Debounce 300ms côté front (`DeezerSearchService`).
- **`chosenDuration` en signal** dans `BlindRoundComponent` — nécessaire pour que `nextDuration` (computed) se recalcule lors des `extend`/`listenMore`. Une propriété ordinaire ne déclenche pas la réactivité Angular.

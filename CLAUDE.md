# CLAUDE.md — InSeconds

Instructions pour Claude quand il travaille dans ce repo. Pour la documentation utilisateur, voir [README.md](README.md) / [README.fr.md](README.fr.md).

## Vue d'ensemble

InSeconds = blind test musical quotidien. 10 morceaux/jour, l'utilisateur choisit combien de secondes il écoute (paliers : 1, 2, 3, 5, 10, 15, 30) avant de tenter artiste + titre. Moins de temps écouté = plus de points. Même défi pour tout le monde, même jour. Mode guest dispo (joue sans s'inscrire, hors classement).

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
│   │   ├── InSeconds.slnx     # solution .NET (FORMAT .slnx OBLIGATOIRE)
│   │   ├── global.json        # rollForward: latestFeature sur .NET 10
│   │   └── InSeconds.Api/     # web API
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
├── Common/                            # services transverses (TextNormalizer, ScoreCalculator)
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

## Architecture frontend

Angular 20 standalone + signals. Bare-bones pour l'instant — features arrivent une à une.

- `src/app/app.config.ts` : `provideHttpClient(withFetch(), withInterceptors([adminAuthInterceptor]))`, router, `provideAppInitializer` pour `SettingsService`
- `src/app/core/interceptors/admin-auth.interceptor.ts` : injecte `Authorization: Bearer admin-token` sur toutes les requêtes `/api/admin` (token stocké en localStorage sous `admin_token`)
- `src/app/core/services/settings.service.ts` : charge les `Settings` BD au démarrage
- `src/environments/environment{,.development}.ts` : `apiUrl`, swap auto via `fileReplacements` dans `angular.json`
- `src/styles.scss` : `@use "tailwindcss";` (PAS `@import` — déprécié Sass 3)
- `.postcssrc.json` : plugin `@tailwindcss/postcss`
- **CORS** : le back autorise `http://localhost:5173` et `https://p01--front--b5cnx77tvxgb.code.run` dans `appsettings.json` (`Cors:AllowedOrigins`)

## Modèle de données (7 tables)

| Table | Rôle |
|-------|------|
| `Players` | `Guid Id`, `IsGuest`, `Pseudo?`, `AuthToken` (cookie HttpOnly), soft-delete (`IsDeleted`), CHECK constraint guest⇔pseudo |
| `Tracks` | référentiel canonique (DeezerTrackId unique) |
| `DailyChallenges` | 1 par jour UTC (Date unique) + Seed pour audit |
| `DailyChallengeTracks` | jonction Track ↔ Challenge + Position (1-10) + DeezerRankSnapshot |
| `GameSessions` | 1 partie/joueur/jour (unique sur `PlayerId+DailyChallengeId`), index leaderboard `(ChallengeId, TotalScore DESC, TotalDurationSeconds)` |
| `GameSessionAnswers` | 1 réponse par track, `ListenedDurationSeconds` (palier choisi), `WasExtended`, `ArtistCorrect`/`TitleCorrect` séparés |
| `Settings` | config key/value modifiable à chaud (timer saisie, paliers, etc.) |

### Conventions modèle

- **`Player.Id` = Guid** (pas int, URL-safe), reste des entités = `int`
- **Soft delete sur Player uniquement** via query filter EF (`!IsDeleted`) propagé en cascade aux sessions/answers
- **Anti-rejeu** : contrainte unique `(PlayerId, DailyChallengeId)` sur `GameSessions`
- **Scoring partiel** possible : `ArtistCorrect` et `TitleCorrect` séparés (pas un seul `IsCorrect`)
- **Durée écoutée = choix discret**, pas une mesure. Paliers dans `Settings.AllowedDurationsSeconds`
- **Migration auto** au boot via `db.Database.Migrate()` dans `Program.cs`

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

# Recréer les conteneurs (si docker compose restart pose souci, ex helper VS injecté)
docker compose down && docker compose up -d
```

## Conventions Git

- **Pas de `Co-Authored-By: Claude` dans les commits**, jamais
- Préférer commits atomiques, messages clairs (FR ou EN, peu importe)
- Branche principale dev : `feat/DevX` (incrémentée à chaque cycle). Cible des PR : `main`

## CI / GitHub Actions

Workflow `.github/workflows/ci.yml`, déclenché sur **push toutes branches + PR vers `main`**, avec `cancel-in-progress` pour annuler les runs obsolètes :

- **Job `back`** : restore + `dotnet build InSeconds.slnx --configuration Release` + `dotnet ef migrations has-pending-model-changes` (fail si une modif `Domain/` ou `Configurations/` n'a pas de migration associée)
- **Job `front`** : `npm ci` + `npm run build` (prod) sur `src/front/InSeconds.Client/`

Runners Ubuntu, ~3-4 min par run. Setup .NET via `global-json-file: src/back/global.json` pour respecter le pin SDK du projet.

### Règles importantes pour la CI

- **Toujours regénérer la migration EF** après une modif d'entité ou de configuration, sinon le job `back` casse
- **Ne pas committer si le build front prod échoue** localement (`npm run build` doit passer)
- **Pas de Docker / docker compose en CI pour l'instant** — pas de tests d'intégration. Quand ils arrivent : préférer **Testcontainers** (tests autonomes, marchent local + CI sans YAML supplémentaire) plutôt qu'ajouter `services:` dans le workflow
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

## Déjà implémenté (non exhaustif)

- Vertical slices `Sessions/StartSession` + `Sessions/SubmitAnswer` (scoring serveur)
- Services Common : `TextNormalizer` (Levenshtein), `ScoreCalculator`, `SettingsService`
- `CookieAuthService` — résout ou crée un Player guest, cookie HttpOnly signé
- `DeezerClient` — `GetPreviewUrlAsync` + `SearchTracksAsync`
- Page admin (`/admin`) — login, création de défis, recherche Deezer, reset sessions du jour
- Auth admin via Bearer token + `adminAuthInterceptor` Angular
- Déploiement Northflank (front + back + PostgreSQL)

## À venir (pas encore implémenté)

- Vertical slice Leaderboard
- `BackgroundService` génération défi quotidien automatique (UTC)
- NSwag pour générer le client TS Angular depuis l'OpenAPI backend
- Mode guest côté UX (création auto au premier appel — `CookieAuthService` prêt, UX manquante)
- `HttpInterceptor` global `withCredentials: true` pour les requêtes joueur
- Tests d'intégration (Testcontainers)
- CI/CD déploiement automatique sur push `main`

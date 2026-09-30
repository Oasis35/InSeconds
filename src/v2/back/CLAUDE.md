# CLAUDE.md — back v2 (refonte)

Back de la v2 d'InSeconds, en construction à côté de la v1 (`src/back/`), qui reste en service jusqu'à la bascule. Plan de référence : [`docs/refonte-v2/PLAN.md`](../../../docs/refonte-v2/PLAN.md) et [`docs/refonte-v2/DEVELOPPEMENT.md`](../../../docs/refonte-v2/DEVELOPPEMENT.md). Ce fichier décrit ce qui existe **déjà** dans le code ; il grossit à chaque PR.

État : **PR A2, Wolverine et Hangfire** (après A1, le socle). Pas encore de module métier ni de vraie connexion (B1) : l'authentification n'a que son socle (cookie, policy Admin).

## Commandes

```bash
cd src/v2/back
dotnet build InSeconds.slnx
dotnet test --solution InSeconds.slnx      # unitaires + architecture + intégration (Docker requis)
dotnet run --project InSeconds.Api          # http://localhost:5175
dotnet run --project InSeconds.Api -- --migrate-only   # applique les migrations puis rend la main

# Régénérer le code Wolverine (après tout ajout ou changement de handler / endpoint), puis commiter
rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write

# Nouvelle migration (depuis src/v2/back/InSeconds.Api)
dotnet ef migrations add <Nom> --output-dir Infrastructure/Persistence/Migrations
```

`global.json` fixe le lanceur de tests **Microsoft.Testing.Platform** (`test.runner`) : avec le SDK .NET 10, `dotnet test` refuse l'ancien mode VSTest pour xUnit v3. D'où `dotnet test --solution …` (et non `dotnet test InSeconds.slnx`).

## Structure

```
src/v2/back/
├── global.json / Directory.Build.props / Directory.Packages.props   # versions centralisées, warnings = erreurs
├── InSeconds.slnx
├── InSeconds.Api/
│   ├── Program.cs
│   └── Infrastructure/
│       ├── Persistence/   # InSecondsDbContext, schémas, migrations, migrateur
│       ├── Settings/      # réglages en base (infra.settings) → IConfiguration
│       ├── Time/          # IGameCalendar (jour de jeu = jour UTC)
│       ├── Errors/        # ProblemDetails : code + traceId, rien d'interne sur un 500
│       ├── Health/        # /health et /health/ready
│       ├── Auth/          # cookie, policy Admin (socle, complété en B1)
│       ├── Messaging/     # Wolverine (HTTP, transactions, outbox)
│       ├── Jobs/          # Hangfire : tâches planifiées, /jobs, GET /api/admin/jobs/{id}
│       └── Hosting/       # --migrate-only, commandes Wolverine
│   └── Internal/Generated/   # code Wolverine généré, COMMITÉ (vérifié en CI)
└── tests/
    ├── InSeconds.UnitTests/
    ├── InSeconds.ArchitectureTests/   # règles de dépendance, horloge, schémas
    └── InSeconds.IntegrationTests/    # Testcontainers postgres:17-alpine + WebApplicationFactory
```

Les modules métier vivront dans `InSeconds.Api/Modules/<Module>/` ; un module n'utilise des autres que leur dossier `Contracts` (vérifié par `ArchitectureTests/ModuleDependencyTests`, qui s'applique dès qu'un module existe).

## Règles

- **Rien dans le schéma `public`** : la v2 partage la base de la v1 jusqu'à la bascule, et toutes les tables v1 sont dans `public`. Chaque entité déclare son schéma (`infra`, puis un schéma par module). L'historique EF est `infra.__ef_migrations_history`. Vérifié par `PersistenceTests` et `DatabaseTests`.
- **Noms en snake_case** (`EFCore.NamingConventions`).
- **`citext` vit dans le schéma `extensions`** (pas dans `public`). Ses opérateurs, dont `=`, n'y sont trouvés que si `extensions` est dans le `search_path` : `DatabaseServiceCollectionExtensions.WithExtensionsSearchPath` l'ajoute à la chaîne de connexion. Sans lui, PostgreSQL compare en `text`, sensible à la casse, sans aucune erreur (constaté en A1). Toute connexion ouverte hors du `DbContext` sur une colonne `citext` doit passer par cette méthode.
- **Jamais `DateTime.UtcNow`/`Now`/`Today`** (ni `DateTimeOffset`) dans `InSeconds.Api` : l'heure vient de `TimeProvider` ou d'`IGameCalendar` (`Now`, `Today`, `StartOf(jour)`), remplaçables en test par `FakeTimeProvider`. Vérifié par `ClockUsageTests` (scan des sources).
- **Erreurs** : toute réponse d'erreur est un ProblemDetails avec `code` (`ErrorCodes`, ex. `common.not_found`) et `traceId` (32 hex, recherchable dans Grafana). Sur un 500, titre générique, ni `detail` ni exception. Les modules ajouteront leurs propres codes (`daily.xxx`…).
- **Tests** : `Assert` de xUnit uniquement (pas de FluentAssertions, licence payante depuis la v8). Une base neuve par classe de tests d'intégration (`PostgresFixture.CreateDatabaseAsync`), un seul conteneur pour toute la suite.

## Réglages (`infra.settings`)

Une ligne par réglage : `key` = chemin de configuration complet (`Daily:GuessTimerSeconds`), `value` en `jsonb`. `DatabaseSettingsConfigurationProvider` lit la table et l'aplatit dans `IConfiguration` (`SettingsJsonFlattener` : objet → `clé:propriété`, tableau → `clé:0`, `clé:1`…). Les modules lisent leurs options par `IOptionsMonitor<T>` : **tout est relu à chaud**, sans redémarrage.

- Écrire un réglage : `SettingsStore.SetAsync(key, value)` (upsert puis rechargement).
- Après une écriture SQL directe : `ISettingsReloader.Reload()`.
- Le provider ignore seulement « base, schéma ou table absents » (premier démarrage avant migration) ; toute autre erreur SQL empêche le démarrage.
- **Pas de clé de dictionnaire décimale** : le binder .NET laisse un `Dictionary<decimal, …>` vide sans erreur. D'où `DurationScores` stocké en liste d'objets `[{"seconds":0.5,"score":1000},…]`. Les clés `string`, entières ou `enum` fonctionnent (`HintPenaltyPercent` : `{"1":30,"2":60}` → `Dictionary<int,int>`).

## Démarrage

`Program.cs` : réglages en base → `DbContext` → migrations → calendrier → ProblemDetails → health checks → auth → Wolverine → Hangfire, puis `RunJasperFxCommands(args)` (démarre l'API, ou exécute une commande Wolverine comme `codegen write`). Les migrations passent par `DatabaseStartupService` (`IHostedLifecycleService.StartingAsync`) : avant le démarrage de Wolverine et Hangfire, sauf si `Database:MigrateOnStartup=false` ; les réglages sont rechargés juste après (la table peut ne pas avoir existé à la construction de la configuration). Une commande Wolverine ne démarre pas l'hôte : pas de migration, et pas de lecture des réglages en base (`CommandLine.StartsServer`), pour que la CI génère le code sans base.

`--migrate-only` (`MigrateOnlyCommand`) : hôte minimal (base seulement, ni serveur web ni tâche de fond), applique les migrations et rend la main avec le code 0. Sert au déploiement et à l'import des données v1.

## Wolverine (`Infrastructure/Messaging/WolverineSetup.cs`)

- Endpoints en **Wolverine.Http** (`[WolverineGet]`…), validation FluentValidation en ProblemDetails. Toute route `/api/admin*` reçoit la policy Admin (`ConfigureEndpoints`) : impossible d'oublier l'attribut.
- `AutoApplyTransactions` + transactions EF Core : un handler qui modifie le `DbContext` et publie un message fait **une seule transaction** (donnée + outbox). Messages durables dans le schéma **`messaging`** (`PersistMessagesWithPostgresql(cs, "messaging")`, files locales durables). Vérifié par `Messaging/OutboxTests` : message envoyé seulement si la donnée est enregistrée, et aucun message ni enveloppe sinon.
- **Les tables de `messaging` sont créées par Wolverine au démarrage, pas par les migrations EF.** `MapWolverineEnvelopeStorage("messaging")` ne fait que les déclarer au `DbContext` (exclues des migrations ; la migration `MapWolverineEnvelopeStorage` est vide exprès). `--migrate-only` ne les crée donc pas.
- **Codegen statique** : en Production et Staging, `TypeLoadMode.Static` (`WolverineSetup.UsesStaticCodegen`) ; le code est lu dans `Internal/Generated`, commité. Ailleurs, génération à la volée (`UseRuntimeCompilation`). Oublier de régénérer = l'API refuse de démarrer en staging (`MissingPreBuiltTypesException`, testé par `StaticCodegenTests`) ; le job CI `back-v2` supprime le dossier, relance `codegen write` et échoue si le résultat diffère du dépôt. `codegen write` ne supprime pas les fichiers périmés : toujours `rm -rf` avant.

## Tâches planifiées (Hangfire, `Infrastructure/Jobs/`)

- Stockage PostgreSQL dans le schéma **`jobs`** (créé par Hangfire au démarrage, comme `messaging`). Serveur de tâches si `Jobs:Server:Enabled` (défaut `true`, `false` dans les tests d'intégration), `Jobs:Server:WorkerCount` (défaut 2 : peu de tâches, et chaque worker tient une connexion).
- **Déclarer une tâche** : une classe `IScheduledJob` (`RunAsync` renvoie un résultat sérialisé en JSON, ou `null`), enregistrée par `services.AddScheduledJob<TJob>("id", Cron.Daily())`. Planning surchargeable par `Jobs:<id>:Cron`, fuseau UTC. `RecurringJobsRegistrar` enregistre les tâches au démarrage et **supprime celles qui ne sont plus déclarées**. Ajouter la tâche à `ExpectedJobs` de `Jobs/ScheduledJobsTests` (liste vide tant qu'aucun module n'en déclare).
- **Échec métier** : lever `JobFailedException("module.code")` ; le code est renvoyé tel quel. Toute autre exception est rendue en `common.unexpected` (ni message ni pile exposés).
- **Tableau de bord `/jobs`** : policy Admin (401 anonyme, 403 joueur), `Authorization = []` (le filtre par défaut de Hangfire n'accepte que localhost), jeton antiforgery exigé sur ses actions. À protéger en plus par Cloudflare Access avant la mise en ligne (S3).
- **`GET /api/admin/jobs/{id}`** : état d'une exécution (`queued`, `processing`, `succeeded`, `failed`, `retry_scheduled`, `deleted`), `result` (JSON) si réussie, `errorCode` si échouée ; 404 `common.not_found` si l'id est inconnu.

## Authentification (socle, `Infrastructure/Auth/AuthSetup.cs`)

Cookie ASP.NET Core qui répond 401/403 (jamais de redirection), policy `Admin` = joueur authentifié avec le rôle `admin`, antiforgery enregistré. B1 le complète (`__Host-`, sessions par appareil, rôle lu en base). Tests : `TestAuthHandler` remplace l'authentification par deux en-têtes (`factory.CreateClient(TestUser.Admin)`, `TestUser.Player`) ; le refus reste celui du cookie de l'API.

## Ports

API v2 en local : **5175** (`Properties/launchSettings.json`). La base locale est la même que la v1 (5432).

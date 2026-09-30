# CLAUDE.md — back v2 (refonte)

Back de la v2 d'InSeconds, en construction à côté de la v1 (`src/back/`), qui reste en service jusqu'à la bascule. Plan de référence : `refonte-v2-plan-detaille-2026-09-30.md` et `refonte-v2-plan-developpement-2026-09-30.md` (dossier `audit/` des fichiers du projet). Ce fichier décrit ce qui existe **déjà** dans le code ; il grossit à chaque PR.

État : **PR A1, socle**. Pas encore de module métier, de Wolverine, de Hangfire ni d'authentification : ils arrivent dans les PR suivantes (A2 à A6).

## Commandes

```bash
cd src/v2/back
dotnet build InSeconds.slnx
dotnet test --solution InSeconds.slnx      # unitaires + architecture + intégration (Docker requis)
dotnet run --project InSeconds.Api          # http://localhost:5175
dotnet run --project InSeconds.Api -- --migrate-only   # applique les migrations puis rend la main

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
│       └── Hosting/       # --migrate-only
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

`Program.cs` : réglages en base → `DbContext` → calendrier → ProblemDetails → health checks. Les migrations s'appliquent au démarrage sauf si `Database:MigrateOnStartup=false` ; les réglages sont rechargés juste après (la table peut ne pas avoir existé à la construction de la configuration).

`--migrate-only` (`MigrateOnlyCommand`) : hôte minimal (base seulement, ni serveur web ni tâche de fond), applique les migrations et rend la main avec le code 0. Sert au déploiement et à l'import des données v1.

## Ports

API v2 en local : **5175** (`Properties/launchSettings.json`). La base locale est la même que la v1 (5432).

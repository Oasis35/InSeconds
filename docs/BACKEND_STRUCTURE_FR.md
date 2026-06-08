# Architecture Backend (.NET 10)

> Référence d'architecture backend InSeconds. Pour les conventions et pièges connus, voir [`CLAUDE.md`](../CLAUDE.md).

## Stack

- **.NET 10** (`net10.0`, nullable + implicit usings)
- **Wolverine 6.x** (médiateur in-process, handlers par convention) + `WolverineFx.RuntimeCompilation` (obligatoire en dev — Wolverine 6.x ne ship plus le compilateur runtime)
- **WolverineFx.EntityFrameworkCore** (transactions auto autour des handlers)
- **WolverineFx.FluentValidation** (validation injectée dans le pipeline Wolverine)
- **EF Core 10** + `Npgsql.EntityFrameworkCore.PostgreSQL`
- **`Microsoft.AspNetCore.OpenApi`** pour exposer `/openapi/v1.json` (consommé par NSwag côté front)
- **PostgreSQL** (addon Northflank en prod, image Docker en dev)

## Structure dossiers — Vertical Slice

```
src/back/InSeconds.Api/
├── Features/                              # 1 dossier = 1 use-case complet
│   ├── Sessions/StartSession/
│   ├── Sessions/SubmitAnswer/
│   ├── Stats/Today/
│   └── Admin/…
├── Domain/                                # Entités EF pures, sans annotations
│   ├── Player.cs
│   ├── Track.cs
│   ├── DailyChallenge.cs
│   ├── DailyChallengeTrack.cs
│   ├── GameSession.cs
│   ├── GameSessionAnswer.cs
│   └── Setting.cs
├── Infrastructure/
│   ├── Persistence/
│   │   ├── ApplicationDbContext.cs
│   │   ├── Configurations/                # 1 IEntityTypeConfiguration<T> par entité
│   │   └── Migrations/
│   └── Deezer/                            # DeezerClient (HttpClient typed)
├── Common/
│   ├── Auth/                              # CookieAuthService + PlayerAuthMiddleware
│   ├── Scoring/                           # ScoreCalculator
│   ├── Settings/                          # AppSettings, SettingsService, AppDbConfigurationSource
│   └── Text/                              # TextNormalizer (Levenshtein)
└── Program.cs
```

### Règles dures (ne pas dévier)

- **Pas de couche service partagée fourre-tout** — chaque feature porte sa logique dans son handler
- **Pas d'abstraction `IRepository<T>`** — `ApplicationDbContext` injecté directement dans les handlers
- **Handlers Wolverine par convention** : méthode `Handle(...)`, pas d'interface à implémenter
- **Validation = FluentValidation par commande** (pas DataAnnotations)
- **Endpoints = Minimal API**, un fichier par endpoint avec `MapXxx(this IEndpointRouteBuilder)`
- **SOLID s'applique aux services Common** (interfaces seulement si vrai besoin de mock)

## Modèle de données — 7 entités

Toutes les entités dans `Domain/` (sans annotations EF). Contraintes/index/cascades dans `Infrastructure/Persistence/Configurations/`.

### Player

```csharp
public sealed class Player
{
    public Guid Id { get; set; }            // URL-safe, exposable dans les routes
    public bool IsGuest { get; set; }
    public string? Pseudo { get; set; }     // null pour guests, ≤20 chars sinon
    public Guid AuthToken { get; set; }     // secret porté par le cookie HTTP-only
    public DateTime CreatedAt { get; set; }
    public bool IsDeleted { get; set; }     // soft-delete
}
```

- `IX_Players_AuthToken` (unique)
- `CK_Players_GuestPseudo` : invariant `IsGuest ⇔ Pseudo IS NULL` garanti en BD
- **Global query filter EF** `!IsDeleted` propagé en cascade sur sessions/answers

### Track

```csharp
public sealed class Track
{
    public int Id { get; set; }
    public long DeezerTrackId { get; set; }   // unique
    public required string Artist { get; set; }
    public required string Title { get; set; }
    public string? CoverHash { get; set; }    // hash seul (pas l'URL complète)
    public DateTime CreatedAt { get; set; }
}
```

`CoverHash` = hash Deezer extrait de l'URL. L'URL complète est reconstruite à la volée via `AppSettings.BuildCoverUrl(hash)` en utilisant `CoverUrlTemplate` depuis `Settings`.

### DailyChallenge / DailyChallengeTrack

```csharp
public sealed class DailyChallenge
{
    public int Id { get; set; }
    public DateOnly Date { get; set; }   // unique → 1 défi par jour UTC
    public int Seed { get; set; }        // graine RNG pour audit/reproductibilité
}

public sealed class DailyChallengeTrack
{
    public int Id { get; set; }
    public int DailyChallengeId { get; set; }
    public int TrackId { get; set; }
    public int Position { get; set; }            // 1..N
    public int DeezerRankSnapshot { get; set; }
}
```

Contraintes : `UNIQUE (DailyChallengeId, Position)` + `UNIQUE (DailyChallengeId, TrackId)`.

### GameSession

```csharp
public sealed class GameSession
{
    public int Id { get; set; }
    public Guid PlayerId { get; set; }
    public int DailyChallengeId { get; set; }
    public int TotalScore { get; set; }
    public decimal TotalDurationSeconds { get; set; }  // somme des paliers joués
    public DateTime CreatedAt { get; set; }
}
```

- `UNIQUE (PlayerId, DailyChallengeId)` → **anti-rejeu : 1 partie/jour/joueur**
- `IX_GameSessions_Leaderboard (DailyChallengeId, TotalScore DESC, TotalDurationSeconds ASC)`

### GameSessionAnswer

```csharp
public sealed class GameSessionAnswer
{
    public int Id { get; set; }
    public int GameSessionId { get; set; }
    public int DailyChallengeTrackId { get; set; }
    public decimal ListenedDurationSeconds { get; set; }  // palier choisi (0.5, 1, 1.5, 2, 3, 5, 10)
    public bool WasExtended { get; set; }
    public bool ArtistCorrect { get; set; }
    public bool TitleCorrect { get; set; }
    public int Score { get; set; }
}
```

`ListenedDurationSeconds` = **choix discret**, pas une mesure. Le serveur valide que la valeur est dans `Settings.AllowedDurationsSeconds`.

### Setting (configuration key/value)

Voir la table des valeurs par défaut dans [`CLAUDE.md`](../CLAUDE.md#settings-en-base-valeurs-par-défaut).

## Settings — chargement au boot

`AppDbConfigurationSource` / `AppDbConfigurationProvider` lit la table `Settings` via ADO.NET brut au démarrage et injecte les valeurs sous le préfixe `AppDb:` dans `IConfiguration`. L'auto-binding `IOptions<AppSettings>` fait le reste.

`AppSettingsPostConfigure` gère les types complexes : `decimal[]` (CSV) et `Dictionary<decimal,int>`.

**Piège important** : pour mettre à jour une valeur de Setting en migration, utiliser `migrationBuilder.Sql("UPDATE ...")` et **non** `UpdateData` — `UpdateData` ne s'exécute que sur les données de seed fraîches, pas sur une DB prod existante.

## Services Common

### ScoreCalculator

```csharp
public int Calculate(
    decimal listenedDurationSeconds,
    bool wasExtended,
    bool artistCorrect,
    bool titleCorrect,
    Dictionary<decimal, int> durationScores)
```

- Score de base = `durationScores[listenedDurationSeconds]`
- Prolongation : `× 0.75`
- Scoring partiel : `ArtistCorrect XOR TitleCorrect` → `× 0.5`

### TextNormalizer

Distance Levenshtein + normalisation accents/stop-words. Utilisé dans `SubmitAnswerHandler` pour comparer la saisie joueur à l'artiste/titre canonique.

### SettingsService

Wrapper `IOptions<AppSettings>` (singleton, calculé une fois au démarrage) :

```csharp
public sealed class SettingsService(IOptions<AppSettings> options)
{
    public Task<AppSettings> GetAsync(CancellationToken ct = default)
        => Task.FromResult(options.Value);
}
```

### CookieAuthService

Résout ou crée un `Player` guest à partir du cookie HTTP-only signé. `SameSite=None; Secure=true` en prod (cross-origin Northflank).

### DeezerClient

`GetPreviewUrlAsync(trackId)` + `SearchTracksAsync(query)`. Extrait le `CoverHash` depuis l'URL Deezer via `ExtractCoverHash()`.

## Vertical slices implémentées

| Slice | Endpoint | Rôle |
|-------|----------|------|
| `Sessions/StartSession` | `POST /api/sessions` | Crée ou récupère la session du jour |
| `Sessions/SubmitAnswer` | `POST /api/sessions/{id}/answers` | Scoring serveur + stats par morceau |
| `Stats/Today` | `GET /api/stats/today` | Score joueur, médiane, stats par morceau |
| `Admin/Login` | `POST /api/admin/login` | Génère un Bearer token admin |
| `Admin/Tracks/*` | `/api/admin/tracks` | Gestion pool morceaux |
| `Admin/Challenges/*` | `/api/admin/challenges` | Création défis + recherche Deezer |
| `Admin/GenerateToday` | `POST /api/admin/generate-today` | Génère le défi du jour à la demande |
| `Admin/ResetToday` | `DELETE /api/admin/reset-today` | Supprime le défi du jour |

## CI

Job `back` : `dotnet build --configuration Release` + `dotnet ef migrations has-pending-model-changes`. Si tu modifies une entité ou une configuration EF, **regénère la migration** sinon la CI casse.

# Architecture Backend (.NET 10)

> Référence d'architecture backend InSeconds. Reflète l'état du code à la racine du repo. Pour les conventions de code et les pièges connus, voir [`CLAUDE.md`](../CLAUDE.md).

## Stack

- **.NET 10** (TFM `net10.0`, nullable + implicit usings)
- **Wolverine 6.0.2** (médiateur in-process + handlers par convention) avec `WolverineFx.RuntimeCompilation` pour le dev
- **WolverineFx.EntityFrameworkCore** (transactions auto autour des handlers qui écrivent en BD)
- **FluentValidation 12** (via `WolverineFx.FluentValidation` — validation injectée dans le pipeline)
- **EF Core 10** + `Microsoft.EntityFrameworkCore.SqlServer`
- **`Microsoft.AspNetCore.OpenApi`** pour exposer `/openapi/v1.json` (consommé plus tard par NSwag côté front)
- **SQL Server 2025** (image Docker `mcr.microsoft.com/mssql/server:2025-latest`)

## Solution et fichiers à la racine

- Solution `src/back/InSeconds.slnx` (**format XML moderne**, créée avec `dotnet new sln --format slnx`)
- `src/back/global.json` avec `rollForward: latestFeature` (accepte tout SDK 10.0.x)
- `src/back/InSeconds.Api/InSeconds.Api.csproj` (web API)
- `src/back/InSeconds.Api/Dockerfile` (image dev SDK avec `dotnet watch` + polling watcher pour bind mount Windows)
- `src/back/.dockerignore`

## Structure dossiers — Vertical Slice

```
src/back/InSeconds.Api/
├── Features/                              # 1 dossier = 1 use-case complet
│   └── <Aggregate>/<UseCase>/             # ex Sessions/StartSession, Leaderboard/GetLeaderboard
│       ├── XxxEndpoint.cs                 # Minimal API : MapXxx(this IEndpointRouteBuilder)
│       ├── XxxCommand.cs (ou Query.cs)    # Record DTO
│       ├── XxxHandler.cs                  # Méthode Handle() détectée par Wolverine
│       ├── XxxValidator.cs                # FluentValidation : AbstractValidator<XxxCommand>
│       └── XxxResponse.cs                 # Record DTO de retour
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
│   │   ├── ApplicationDbContext.cs        # DbSets + ApplyConfigurationsFromAssembly
│   │   ├── Configurations/                # 1 IEntityTypeConfiguration<T> par entité
│   │   └── Migrations/                    # InitialCreate + suivantes
│   └── Deezer/                            # (à venir) client HTTP + cache
├── Common/                                # Services transverses (rien d'autre)
│   ├── Scoring/                           # (à venir) ScoreCalculator
│   └── Text/                              # (à venir) TextNormalizer (Levenshtein)
├── Properties/launchSettings.json
├── appsettings.json
├── appsettings.Development.json
└── Program.cs
```

### Règles dures (ne pas dévier)

- **Pas de couche service partagée fourre-tout** — chaque feature porte sa logique dans son handler
- **Pas d'abstraction `IRepository<T>`** — `ApplicationDbContext` est injecté directement dans les handlers
- **Handlers Wolverine par convention** : classe avec une méthode `Handle(MaCommande, ApplicationDbContext db, ...)`, pas d'interface à implémenter
- **Validation = FluentValidation par commande** (pas DataAnnotations)
- **Endpoints = Minimal API**, un fichier par endpoint avec extension `MapXxx(this IEndpointRouteBuilder)` appelé depuis `Program.cs`
- **SOLID s'applique aux services Common** (interfaces seulement si vrai besoin de mock, sinon classes scellées injectées directement)
- **Cibler `net10.0`**, `nullable enable`, `ImplicitUsings enable`

## Program.cs (état actuel)

```csharp
using FluentValidation;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.FluentValidation;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicyName = "AllowAngular";

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddValidatorsFromAssemblyContaining<Program>(includeInternalTypes: true);

builder.Host.UseWolverine(opts =>
{
    opts.UseRuntimeCompilation();           // critique : Wolverine 6.x ne ship plus le compilateur runtime
    opts.UseEntityFrameworkCoreTransactions();
    opts.UseFluentValidation();
    opts.Policies.AutoApplyTransactions();
});

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
        policy.WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddOpenApi();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.Migrate();                  // auto-migration au boot (OK pour dev/MVP)
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(CorsPolicyName);

app.MapGet("/health", () => Results.Ok(new { status = "ok", utc = DateTime.UtcNow }));

app.Run();
```

**À ajouter au fil des features** : enregistrement des endpoints via leurs `MapXxx` (un appel par feature, idéalement regroupés par aggregate).

## appsettings.json (état actuel)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost,1433;Database=InSeconds;User Id=sa;Password=P@ssw0rd!In3Secs;TrustServerCertificate=true;Encrypt=false;"
  },
  "Deezer": {
    "BaseUrl": "https://api.deezer.com"
  },
  "Cors": {
    "AllowedOrigins": [ "http://localhost:5172" ]
  },
  "Logging": {
    "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" }
  },
  "AllowedHosts": "*"
}
```

> En conteneur, la connection string est **surchargée** via la variable d'env `ConnectionStrings__DefaultConnection` dans `docker-compose.yml` (l'hôte devient `database`, le nom du service compose).

## Modèle de données — 7 entités

Toutes les entités sont dans `Domain/` (sans annotations EF). Les contraintes/index/cascades vivent dans `Infrastructure/Persistence/Configurations/<Entity>Configuration.cs`.

### Player

```csharp
public sealed class Player
{
    public Guid Id { get; set; }                   // URL-safe, exposable dans les routes
    public bool IsGuest { get; set; }              // true = anonyme, false = inscrit
    public string? Pseudo { get; set; }            // null pour guests, ≤20 chars sinon
    public string? Email { get; set; }             // optionnel même pour inscrits (V2 OAuth)
    public Guid AuthToken { get; set; }            // secret porté par le cookie HTTP-only
    public DateTime CreatedAt { get; set; }
    public DateTime? LastSeenAt { get; set; }      // pour cleanup périodique des guests
    public bool IsDeleted { get; set; }            // soft-delete (RGPD à compléter par anonymisation)
    public DateTime? DeletedAt { get; set; }

    public ICollection<GameSession> GameSessions { get; set; } = [];
}
```

**Indexes & contraintes** :

- `IX_Players_AuthToken` (unique)
- `IX_Players_Pseudo` (unique, filtré `[IsGuest] = 0 AND [Pseudo] IS NOT NULL`)
- `IX_Players_Email` (unique, filtré `[Email] IS NOT NULL`)
- `CK_Players_GuestPseudo` : `([IsGuest]=1 AND [Pseudo] IS NULL) OR ([IsGuest]=0 AND [Pseudo] IS NOT NULL)` — invariant métier garanti par la BD
- **Global query filter EF** : `HasQueryFilter(p => !p.IsDeleted)` propagé en cascade sur `GameSession` (`!s.Player.IsDeleted`) et `GameSessionAnswer` (`!a.GameSession.Player.IsDeleted`) → les joueurs soft-deletés disparaissent automatiquement de toutes les requêtes

### Track (référentiel canonique)

```csharp
public sealed class Track
{
    public int Id { get; set; }
    public long DeezerTrackId { get; set; }        // unique → 1 ligne par morceau Deezer
    public required string Artist { get; set; }    // ≤200
    public required string Title { get; set; }     // ≤300
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public ICollection<DailyChallengeTrack> DailyChallengeTracks { get; set; } = [];
}
```

### DailyChallenge

```csharp
public sealed class DailyChallenge
{
    public int Id { get; set; }
    public DateOnly Date { get; set; }             // unique → 1 défi par jour UTC
    public int Seed { get; set; }                  // graine RNG pour audit/reproductibilité

    public ICollection<DailyChallengeTrack> Tracks { get; set; } = [];
    public ICollection<GameSession> GameSessions { get; set; } = [];
}
```

### DailyChallengeTrack (jonction Challenge ↔ Track)

```csharp
public sealed class DailyChallengeTrack
{
    public int Id { get; set; }
    public int DailyChallengeId { get; set; }
    public int TrackId { get; set; }
    public int DeezerRankSnapshot { get; set; }    // snapshot au moment de la génération, stabilise le scoring
    public int Position { get; set; }              // 1..10

    public DailyChallenge DailyChallenge { get; set; } = null!;
    public Track Track { get; set; } = null!;
    public ICollection<GameSessionAnswer> Answers { get; set; } = [];
}
```

**Contraintes** : `UNIQUE (DailyChallengeId, Position)` (10 slots distincts) + `UNIQUE (DailyChallengeId, TrackId)` (pas 2× le même morceau dans un défi).

### GameSession

```csharp
public sealed class GameSession
{
    public int Id { get; set; }
    public Guid PlayerId { get; set; }
    public int DailyChallengeId { get; set; }
    public int TotalScore { get; set; }
    public int TotalDurationSeconds { get; set; }  // somme des ListenedDurationSeconds des answers
    public DateTime CreatedAt { get; set; }

    public Player Player { get; set; } = null!;
    public DailyChallenge DailyChallenge { get; set; } = null!;
    public ICollection<GameSessionAnswer> Answers { get; set; } = [];
}
```

**Contraintes & indexes** :

- `UNIQUE (PlayerId, DailyChallengeId)` → **anti-rejeu : 1 partie/jour/joueur**
- `IX_GameSessions_Leaderboard (DailyChallengeId, TotalScore DESC, TotalDurationSeconds ASC) INCLUDE (PlayerId)` → top 100 sans scan
- Cascade `Player → Sessions` (cleanup guests OK), Restrict `Challenge → Sessions` (préserve l'historique)

### GameSessionAnswer

```csharp
public sealed class GameSessionAnswer
{
    public int Id { get; set; }
    public int GameSessionId { get; set; }
    public int DailyChallengeTrackId { get; set; }
    public int ListenedDurationSeconds { get; set; }  // palier choisi (1, 2, 3, 5, 10, 15, 30)
    public bool WasExtended { get; set; }             // l'utilisateur a-t-il utilisé sa prolongation ?
    public string? ArtistAnswer { get; set; }
    public string? TitleAnswer { get; set; }
    public bool ArtistCorrect { get; set; }           // scoring partiel possible
    public bool TitleCorrect { get; set; }
    public int Score { get; set; }

    public GameSession GameSession { get; set; } = null!;
    public DailyChallengeTrack Track { get; set; } = null!;
}
```

**Contrainte** : `UNIQUE (GameSessionId, DailyChallengeTrackId)` → une seule réponse par track et par session.

> ⚠️ **Important** : `ListenedDurationSeconds` est un **choix discret** (pas une mesure). Le serveur valide que la valeur est dans la liste autorisée (`Settings.AllowedDurationsSeconds`). Plus de `ElapsedMs` mesuré en `requestAnimationFrame` côté front comme dans la v0 du doc.

### Setting (configuration key/value)

```csharp
public sealed class Setting
{
    public int Id { get; set; }
    public required string Key { get; set; }       // unique, ≤100
    public required string Value { get; set; }     // string parsée à l'usage
    public string? Description { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

**Données seed** (dans la migration `InitialCreate` via `HasData`) :

| Key | Value | Description |
|-----|-------|-------------|
| `GuessTimerSeconds` | `20` | Temps de saisie autorisé après la fin de la lecture |
| `AllowedDurationsSeconds` | `1,2,3,5,10,15,30` | Paliers d'écoute proposés (CSV) |
| `MaxExtensionsPerAnswer` | `1` | Nombre de prolongations autorisées par réponse |
| `TracksPerChallenge` | `10` | Nombre de morceaux dans un défi quotidien |

Toutes ces valeurs sont modifiables à chaud sans redéploiement.

## Services Common à venir

### TextNormalizer

```csharp
public sealed class TextNormalizer
{
    public bool IsMatch(string expected, string given, int levenshteinThreshold = 2)
    {
        // 1. Normaliser : minuscules, retirer accents, retirer stop words ("the", "le", "la", "les", "feat.", "ft.", "&", ...)
        // 2. Calculer distance Levenshtein
        // 3. Retourner vrai si distance <= seuil
    }
}
```

### ScoreCalculator

Adapté au modèle "durée choisie" (pas de mesure ms) :

```csharp
public sealed class ScoreCalculator
{
    public int Calculate(int listenedDurationSeconds, int deezerRankSnapshot, bool artistCorrect, bool titleCorrect)
    {
        if (!artistCorrect && !titleCorrect) return 0;

        // base = score max par palier (à définir, ex 1000 pour 1s, dégressif jusqu'à 100 pour 30s)
        // bonus difficulté basé sur deezerRankSnapshot (rang élevé = morceau plus obscur = bonus +)
        // pénalité si une seule moitié correcte (ArtistCorrect XOR TitleCorrect → ×0.4 par exemple)
        // … logique à finaliser
    }
}
```

### DeezerClient (Infrastructure/Deezer/)

```csharp
public interface IDeezerClient
{
    Task<DeezerTrackDto?> GetTrackAsync(long trackId, CancellationToken ct);
    Task<IReadOnlyList<DeezerTrackDto>> GetTopTracksByGenreAsync(string genreId, int limit, CancellationToken ct);
    Task<IReadOnlyList<DeezerTrackDto>> SearchAsync(string query, CancellationToken ct);
}
```

Implémentation `DeezerClient` (HttpClient) + décorateur `DeezerCacheDecorator` (IMemoryCache) injecté en respectant OCP. Rate limit Deezer : 50 req / 5 s.

### DailyChallengeGeneratorService (BackgroundService)

```csharp
public sealed class DailyChallengeGeneratorService : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Tourne quotidiennement à minuit UTC
        // 1. Vérifier si DailyChallenge existe pour aujourd'hui — sinon en générer un
        // 2. Tirer N tracks (TracksPerChallenge depuis Settings) depuis Deezer avec un seed reproductible
        // 3. Upsert Tracks dans le référentiel + créer DailyChallengeTracks avec Position 1..N et DeezerRankSnapshot
        // 4. Logger + gestion erreurs
    }
}
```

## Auth (cookie HTTP-only)

V1 = pseudo seul, pas de mot de passe ni OAuth.

- Au 1ᵉʳ appel sans cookie : créer `Player { IsGuest=true, AuthToken=Guid.NewGuid() }`, poser un cookie HttpOnly signé avec le `AuthToken`
- Les requêtes suivantes lisent le cookie → middleware résout le `Player` courant
- Inscription = `POST /api/auth/register { pseudo }` : `UPDATE` sur le `Player` courant (`IsGuest=false`, `Pseudo=...`) → **historique conservé**
- Le `Player.AuthToken` n'est jamais exposé dans une réponse API (seul l'`Id` peut l'être, et il est inutile sans le token)

## CI

Un workflow GitHub Actions (`.github/workflows/ci.yml`) tourne à chaque push (toutes branches) + PR vers `main` :

- **Job back** : restore + `dotnet build InSeconds.slnx --configuration Release` + `dotnet ef migrations has-pending-model-changes`
- **Job front** : `npm ci` + `npm run build`

→ **Si tu modifies une entité ou une configuration EF, regénère la migration** (`dotnet ef migrations add <Name>`), sinon le job back échoue.

## Commandes utiles

```bash
# Démarrer le stack (DB + API hot-reload)
docker compose up -d

# Logs API
docker logs inseconds.api --tail 50

# Nouvelle migration EF (depuis src/back/InSeconds.Api)
dotnet ef migrations add <Name> --output-dir Infrastructure/Persistence/Migrations

# Appliquer manuellement (normalement auto au boot)
dotnet ef database update

# Build solution
dotnet build src/back/InSeconds.slnx

# Recréer les conteneurs (si docker compose restart pose souci, ex helper VS injecté)
docker compose down && docker compose up -d
```

## Pièges connus

1. **Helper Visual Studio dans le conteneur API** — si VS lance le compose via `.dcproj`, il injecte `dotnet /VSTools/DistrolessHelper/DistrolessHelper.dll --wait` comme PID 1, l'API ne démarre pas. Fix : `docker compose down && docker compose up -d`.
2. **Healthcheck SQL Server 2022/2025** — utiliser `/opt/mssql-tools18/bin/sqlcmd` (pas `mssql-tools`) avec le flag `-C` obligatoire.
3. **Hot-reload dans le conteneur sur Windows** — nécessite `DOTNET_USE_POLLING_FILE_WATCHER=1` (déjà dans le Dockerfile).
4. **Wolverine 6.x sans compilateur runtime** — la dépendance `WolverineFx.RuntimeCompilation` + `opts.UseRuntimeCompilation()` est obligatoire en mode `Dynamic`. Sinon l'app crash au boot.

## Prochaines étapes recommandées

1. Coder `TextNormalizer` + tests unitaires (xUnit)
2. Coder `ScoreCalculator` + tests unitaires
3. Première vertical slice : `Features/Sessions/StartSession/` (endpoint + command + handler + validator + tests d'intégration via Testcontainers)
4. Slice `Features/Sessions/SubmitAnswer/` (le cœur du gameplay)
5. Slice `Features/Leaderboard/GetLeaderboard/`
6. Auth cookie (middleware + slice `Auth/Register`)
7. Client Deezer + `DailyChallengeGeneratorService`
8. Ajouter NSwag côté front pour générer le client TS depuis l'OpenAPI

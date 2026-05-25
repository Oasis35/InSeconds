# Architecture Backend (.NET 10)

## Créer le projet

```bash
dotnet new globaljson --sdk-version 10.0.0
dotnet new sln -n InSeconds
dotnet new webapi -n InSeconds.Api
cd InSeconds.Api
dotnet add package Microsoft.EntityFrameworkCore
dotnet add package Microsoft.EntityFrameworkCore.SqlServer
dotnet add package Microsoft.EntityFrameworkCore.Tools
```

## Structure dossiers à créer

```
InSeconds.Api/
├── Controllers/
│   ├── SessionsController.cs      # POST /api/sessions (endpoint principal)
│   └── LeaderboardController.cs   # GET /api/leaderboard
├── Services/
│   ├── DeezerService.cs           # Wrapper API Deezer
│   ├── ScoreCalculator.cs         # Logique scoring
│   ├── TextNormalizer.cs          # Levenshtein + normalisation
│   ├── DailyChallengeGeneratorService.cs  # BackgroundService
│   └── AuthService.cs             # Pseudo + auth
├── Data/
│   ├── ApplicationDbContext.cs     # EF Core DbContext
│   └── Migrations/
├── Models/
│   ├── Player.cs
│   ├── DailyChallenge.cs
│   ├── DailyChallengeTrack.cs
│   ├── GameSession.cs
│   ├── GameSessionAnswer.cs
│   ├── DeezerTrack.cs             # DTO API Deezer
│   └── Dtos/
│       ├── SessionRequest.cs
│       ├── AnswerRequest.cs
│       └── LeaderboardEntry.cs
├── appsettings.json
├── appsettings.Development.json
└── Program.cs
```

## Code essentiels

### Program.cs (Injection de Dépendances)
```csharp
using var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Services
builder.Services.AddScoped<DeezerService>();
builder.Services.AddScoped<ScoreCalculator>();
builder.Services.AddScoped<TextNormalizer>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddHostedService<DailyChallengeGeneratorService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngular", policy =>
        policy.WithOrigins("http://localhost:4200")
            .AllowAnyMethod()
            .AllowAnyHeader());
});

var app = builder.Build();
app.UseRouting();
app.UseCors("AllowAngular");
app.MapControllers();
app.Run();
```

### appsettings.json
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost,1433;Database=InSeconds;User Id=sa;Password=REDACTED;TrustServerCertificate=true;"
  },
  "Deezer": {
    "BaseUrl": "https://api.deezer.com"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information"
    }
  }
}
```

---

## Modèles EF Core

### Player.cs
```csharp
public class Player
{
    public int Id { get; set; }
    public string Pseudo { get; set; } = null!;
    public string? GoogleId { get; set; }
    public string? Email { get; set; }
    public DateTime CreatedAt { get; set; }
    
    public ICollection<GameSession> GameSessions { get; set; } = [];
}
```

### DailyChallenge.cs
```csharp
public class DailyChallenge
{
    public int Id { get; set; }
    public DateTime Date { get; set; } // UTC, unique
    public int Seed { get; set; } // pour reproductibilité
    
    public ICollection<DailyChallengeTrack> Tracks { get; set; } = [];
    public ICollection<GameSession> GameSessions { get; set; } = [];
}
```

### DailyChallengeTrack.cs
```csharp
public class DailyChallengeTrack
{
    public int Id { get; set; }
    public int DailyChallengeId { get; set; }
    public long DeezerTrackId { get; set; }
    public string Artist { get; set; } = null!;
    public string Title { get; set; } = null!;
    public int DeezerRank { get; set; } // snapshot au moment création
    public int Position { get; set; } // 1-10
    
    public DailyChallenge DailyChallenge { get; set; } = null!;
    public ICollection<GameSessionAnswer> Answers { get; set; } = [];
}
```

### GameSession.cs
```csharp
public class GameSession
{
    public int Id { get; set; }
    public int PlayerId { get; set; }
    public int DailyChallengeId { get; set; }
    public int TotalScore { get; set; }
    public long TotalDurationMs { get; set; }
    public DateTime CreatedAt { get; set; }
    
    public Player Player { get; set; } = null!;
    public DailyChallenge DailyChallenge { get; set; } = null!;
    public ICollection<GameSessionAnswer> Answers { get; set; } = [];
    
    // Contrainte unique: (PlayerId, DailyChallengeId)
}
```

### GameSessionAnswer.cs
```csharp
public class GameSessionAnswer
{
    public int Id { get; set; }
    public int GameSessionId { get; set; }
    public int DailyChallengeTrackId { get; set; }
    public long ElapsedMs { get; set; }
    public string? ArtistAnswer { get; set; }
    public string? TitleAnswer { get; set; }
    public bool IsCorrect { get; set; }
    public int Score { get; set; }
    
    public GameSession GameSession { get; set; } = null!;
    public DailyChallengeTrack Track { get; set; } = null!;
}
```

---

## Services (Signatures)

### DeezerService.cs
```csharp
public class DeezerService
{
    private readonly HttpClient _httpClient;
    private readonly IMemoryCache _cache;
    
    public DeezerService(HttpClient httpClient, IMemoryCache cache)
    {
        _httpClient = httpClient;
        _cache = cache;
    }
    
    public async Task<DeezerTrack?> GetTrackAsync(long trackId)
    {
        // GET /track/{id}, parser preview + rank
    }
    
    public async Task<List<DeezerTrack>> GetTopTracksByGenreAsync(string genreId, int limit = 10)
    {
        // GET /chart/{genreId}/tracks
    }
    
    public async Task<List<DeezerTrack>> SearchAsync(string query)
    {
        // GET /search?q=...
    }
}
```

### ScoreCalculator.cs
```csharp
public class ScoreCalculator
{
    public int Calculate(long elapsedMs, int deezerRank, bool isPartialMatch)
    {
        // score = 1000 × (1 - elapsedMs / 30000) × bonusDifficulté × pénalitéPartielle
        // deezerRank → bonus difficulté (1.0 à 1.5)
    }
}
```

### TextNormalizer.cs
```csharp
public class TextNormalizer
{
    public bool IsMatch(string expected, string given, int levenshteinThreshold = 2)
    {
        // Normaliser les deux chaînes
        // Calculer distance Levenshtein
        // Retourner vrai si distance <= seuil
    }
    
    private string Normalize(string text)
    {
        // Supprimer accents, minuscules, stop words
    }
}
```

### DailyChallengeGeneratorService.cs
```csharp
public class DailyChallengeGeneratorService : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Exécution quotidienne à minuit UTC
        // Générer 10 pistes depuis Deezer (seed-based)
        // Sauvegarder en BD
        // Cacher résultat
    }
}
```

---

## Prochaines Étapes

1. **Créer .sln & projects** avec commandes ci-dessus
2. **Setup DbContext** → Ajouter tous modèles + créer migration initiale
3. **Implémenter DeezerService** → Appels HTTP, cache
4. **Implémenter TextNormalizer** → Levenshtein
5. **Controllers** → SessionsController.Post (endpoint principal)

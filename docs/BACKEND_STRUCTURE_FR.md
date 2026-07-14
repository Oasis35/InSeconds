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
│   └── Deezer/                            # DeezerClient (HttpClient typed) + CachedDeezerClient (IMemoryCache)
├── Common/
│   ├── Auth/                              # CookieAuthService + PlayerAuthMiddleware
│   ├── Scoring/                           # ScoreCalculator
│   ├── Settings/                          # AppSettings, SettingsService, AppDbConfigurationSource
│   └── Text/                              # TextNormalizer + TextNormalizationHelpers (Levenshtein, accents, regex)
└── Program.cs
```

### Règles dures (ne pas dévier)

- **Pas de couche service partagée fourre-tout** — chaque feature porte sa logique dans son handler
- **Pas d'abstraction `IRepository<T>`** — `ApplicationDbContext` injecté directement dans les handlers
- **Handlers Wolverine par convention** : méthode `Handle(...)`, pas d'interface à implémenter
- **Validation = FluentValidation par commande** (pas DataAnnotations)
- **Endpoints = Minimal API**, un fichier par endpoint avec `MapXxx(this IEndpointRouteBuilder)`
- **SOLID s'applique aux services Common** (interfaces seulement si vrai besoin de mock)
- **`.AsNoTracking()` sur toutes les queries en lecture** — handlers Get/Query/Stats ne modifient rien, le tracking EF est du gaspillage mémoire
- **`Select()` projeté plutôt que `Include().ThenInclude()`** pour les queries lecture-seule — ne charger que les colonnes réellement utilisées
- **`Task.WhenAll()` pour les queries indépendantes** — `Stats/Today` et `GetAdminStats` parallélisent leurs requêtes DB ; ne pas réintroduire des `await` séquentiels sans dépendance réelle

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
    public string? Email { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? LastSeenAt { get; set; }
    public bool IsDeleted { get; set; }     // soft-delete
    public DateTime? DeletedAt { get; set; }
    public int CurrentStreak { get; set; }  // jours consécutifs joués
    public DateOnly? LastPlayedDate { get; set; }
}
```

- `IX_Players_AuthToken` (unique)
- `IX_Players_LastSeenAt` (filtré `NOT NULL`) — requêtes `BuildPlayerBreakdown` dans `GetAdminStats`
- `CK_Players_GuestPseudo` : invariant `IsGuest ⇔ Pseudo IS NULL` garanti en BD
- **Global query filter EF** `!IsDeleted` propagé en cascade sur sessions/answers
- `CurrentStreak` et `LastPlayedDate` mis à jour dans `SubmitAnswer/Handler.cs` à la complétion (parties complètes uniquement) — basés sur `DailyChallenge.Date`, pas sur la date de complétion UTC : `LastPlayedDate` stocke la date du défi, streak +1 si le défi complété est celui du lendemain du dernier défi complété

### Track

```csharp
public sealed class Track
{
    public int Id { get; set; }
    public long DeezerTrackId { get; set; }   // unique
    public required string Artist { get; set; }
    public required string Title { get; set; }
    public string? CoverHash { get; set; }    // hash seul (pas l'URL complète)
    public bool HasPreview { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
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
    public SessionStatus Status { get; set; }          // Pending=0, Completed=1, Abandoned=2
    public DateTime? CompletedAt { get; set; }
    public DateTime? AbandonedAt { get; set; }
    public int? CurrentTrackId { get; set; }            // anti-cheat : track en cours
    public decimal? CurrentTrackMinListenedSeconds { get; set; } // anti-cheat : durée max déjà écoutée
}
```

- `UNIQUE (PlayerId, DailyChallengeId)` → **anti-rejeu : 1 entrée/jour/joueur**
- `IX_GameSessions_Leaderboard (DailyChallengeId, TotalScore DESC, TotalDurationSeconds ASC)`
- `IX_GameSessions_ChallengeStatus (DailyChallengeId, Status)` — requêtes admin
- `IX_GameSessions_PlayerStatusChallenge (PlayerId, Status, DailyChallengeId)` — expiry sessions Pending dans `StartSession`
- **Seules les sessions `Completed` comptent** dans les stats/leaderboard. `Pending` permet la reprise jusqu'à minuit. `Abandoned` (bouton explicite ou expiry paresseuse) bloque le rejeu.
- **Anti-rejeu** : `Completed` ou `Abandoned` → 409. `Pending` → reprise avec `IsResuming=true`.
- **Complétion auto** dans `SubmitAnswer/Handler.cs` : quand `réponses soumises + 1 >= TracksPerChallenge`.
- **Expiry paresseuse** : les sessions `Pending` de la veille sont passées à `Abandoned` au prochain appel `StartSession`.

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
    public string? ArtistAnswer { get; set; }  // réponse saisie persistée
    public string? TitleAnswer { get; set; }
    public int Score { get; set; }
}
```

- `UNIQUE (GameSessionId, DailyChallengeTrackId)`
- `IX_GameSessionAnswers_DailyChallengeTrackId` — agrégats stats par morceau (`Stats/Today`, `GetAdminStats`)

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

Distance Levenshtein + normalisation accents/stop-words. **Préprocesse en supprimant le contenu entre parenthèses/crochets** (`(feat. X)`, `[Radio Edit]`) avant comparaison. Utilisé dans `SubmitAnswerHandler` pour comparer la saisie joueur à l'artiste/titre canonique.

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

**Clés Data Protection persistées en base** : le cookie est chiffré avec les clés ASP.NET Data Protection ; elles sont stockées dans la table `DataProtectionKeys` via `PersistKeysToDbContext<ApplicationDbContext>()` (package `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore`, migration `PersistDataProtectionKeys`). Sans cette persistance, chaque redémarrage/redéploiement Northflank régénérait les clés et invalidait tous les cookies joueurs (streaks et historiques perdus).

### DeezerClient

`GetPreviewUrlAsync(trackId)` + `ProbePreviewAsync(trackId)` + `GetTrackInfoAsync(trackId)` + `SearchTracksAsync(query)`. Extrait le `CoverHash` depuis l'URL Deezer via `ExtractCoverHash()`.

**Résilience** : le `HttpClient` typé est configuré avec `AddStandardResilienceHandler` (`Program.cs`, hors `Testing`) — timeout 4s/tentative, 15s total, retry exponentiel (429/5xx) + circuit breaker. Sans cela, un appel Deezer lent pourrait bloquer `StartSession` jusqu'au timeout `HttpClient` par défaut (100s).

**Gestion d'erreurs** : chaque méthode logge en `Warning` sur échec HTTP ou preview vide, et **re-throw `OperationCanceledException`** (l'annulation n'est jamais transformée en `null`/`[]`). Pas de `catch {}` nu.

**Erreurs Deezer en HTTP 200** : Deezer renvoie quota / rate-limit / track supprimé en **200 OK avec un payload `{"error":{"code":...}}`** — ça contourne le handler de résilience. Les trois méthodes détectent ce payload et le traitent comme un échec. `ProbePreviewAsync` retourne un `DeezerPreviewProbe(Succeeded, PreviewUrl)` qui distingue l'échec de requête (`Succeeded=false` : quota code 4, service busy 700… → état Deezer inconnu) de la réponse déterminée (`Succeeded=true` : preview présente, ou vide, ou code 800 "no data" = track supprimé). C'est ce qui permet au `PreviewStatusRefresher` de ne jamais écrire un faux `HasPreview=false` sur un simple échec réseau.

### CachedDeezerClient

Cache `IMemoryCache` devant `DeezerClient` pour les données partagées entre joueurs (utilisé par `StartSession` et le proxy `/api/deezer/search` ; **pas** côté admin ni dans `PreviewStatusRefresher`, qui ont besoin de l'état Deezer réel).

- **Preview URLs** : TTL 24h **borné par l'expiration de la signature CDN** de l'URL (`?hdnea=exp=<unix>~...`) moins 1h de marge. Une URL signée expirée provoque un 403 CDN à la lecture côté joueur — un TTL fixe qui dépasse la validité de la signature reproduit ce bug.
- **Recherches autocomplete** : TTL 1h, clé normalisée (trim + lowercase).
- Ne cache jamais une preview absente ni un résultat de recherche vide (un échec Deezer transitoire ne doit pas être mémorisé).

## Observabilité

- `GET /health` — liveness. `MapGet` simple renvoyant `{ status, utc, build }` (JSON). **Format consommé par le badge d'état backend du front** (`app.ts`) : ne pas changer les champs existants sans adapter le front (en ajouter est OK). `build` = date UTC de compilation (attribut `AssemblyMetadata BuildUtc` stampé dans le csproj) — identifie la version déployée en un `curl`.
- `GET /health/ready` — readiness, `MapHealthChecks` qui sonde la base via `AddDbContextCheck<ApplicationDbContext>` (tag `ready`, renvoie le texte `Healthy`/`Unhealthy`). Northflank peut le sonder pour des redémarrages propres.

Les deux endpoints sont publics (mappés avant `PlayerAuthMiddleware`). Logging structuré (`ILogger`) dans `DeezerClient` et les `BackgroundService` de génération/refresh.

## Vertical slices implémentées

| Slice | Endpoint | Rôle |
|-------|----------|------|
| `Sessions/StartSession` | `POST /api/sessions` | Crée session Pending ou retourne reprise si Pending existante ; régénère le défi du jour à la volée s'il manque (filet de sécurité, 503 seulement si pool insuffisant) |
| `Sessions/SubmitAnswer` | `POST /api/sessions/{id}/answers` | Scoring serveur + stats + complétion auto |
| `Sessions/AbandonSession` | `PUT /api/sessions/{id}/abandon` | Marque une session Pending comme abandonnée |
| `Stats/Today` | `GET /api/stats/today` | Score joueur, médiane, stats par morceau. `TrackStat` inclut `ArtistCorrect`/`TitleCorrect`/`ListenedDurationSeconds` (nullable — remplis seulement si le joueur a une session `Completed`) |
| `Auth/Me` | `GET /api/auth/me` | Retourne `{ id, isGuest, pseudo }` du joueur courant (cookie) |
| `Settings/GetSettings` | `GET /api/settings` | Expose les settings publics (paliers, timer, scores) |
| `Admin/Login` | `POST /api/admin/login` | Génère un Bearer token admin |
| `Admin/Tracks/GetTracks` | `GET /api/admin/tracks` | Liste Available / Used (`TrackDto.HasPreview` lu depuis la DB) |
| `Admin/Tracks/AddTrack` | `POST /api/admin/tracks` | Ajoute un morceau au pool (upsert sur DeezerTrackId) |
| `Admin/Tracks/DeleteTrack` | `DELETE /api/admin/tracks/{id}` | Supprime un morceau du pool s'il n'est pas utilisé dans un défi (404/409) |
| `Admin/Tracks/UpdateTrack` | `PUT /api/admin/tracks/{id}` | Met à jour DeezerTrackId/Artist/Title/CoverHash — interdit si utilisé dans un défi (409) |
| `Admin/Challenges/*` | `/api/admin/challenges` | Création défis + recherche Deezer |
| `Admin/GenerateToday` | `POST /api/admin/generate-today` | Génère le défi du jour à la demande |
| `Admin/RefreshPreviews` | `POST /api/admin/refresh-previews` | Relance le re-check des previews (délègue à `PreviewStatusRefresher`), retourne `{ checked, updated, failed }` |
| `Admin/ResetToday` | `DELETE /api/admin/reset-today` | Supprime le défi du jour |
| `Admin/Stats` | `GET /api/admin/stats` | Dashboard : activité 30j, répartition joueurs, stats par défi |
| `Deezer/Search` (public) | `GET /api/deezer/search?q=` | Proxy autocomplete Deezer (contourne CORS navigateur) |
| `ChallengeGeneration` | BackgroundService | Génère le défi quotidien à minuit UTC (retry toutes les 10 min en cas d'échec ou de pool insuffisant) — filtre les tracks sans preview active ; planification via `DailySchedule.NextUtcHour` + `DelayUntilAsync` (attente sur cible d'horloge murale — un réveil anticipé de `Task.Delay` ne saute plus de jour) |
| `ChallengeGeneration` (refresh) | BackgroundService | `RefreshPreviewStatusService` à 23h UTC (avant la génération de minuit) — re-vérifie `Track.HasPreview` via `PreviewStatusRefresher` (lots de 10 espacés de 1,5 s, flag jamais modifié sur un échec Deezer) |

## CI

Job `back` : `dotnet build --configuration Release` + `dotnet ef migrations has-pending-model-changes`. Si tu modifies une entité ou une configuration EF, **regénère la migration** sinon la CI casse.

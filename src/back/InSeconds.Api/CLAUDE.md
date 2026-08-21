# CLAUDE.md — backend `InSeconds.Api`

Doc détaillée du backend. Vue d'ensemble générale, conventions .NET globales (`.slnx`, `global.json`), pièges cross-cutting et CI : voir le `CLAUDE.md` racine — pas répétés ici.

## Feature slices (`Features/`)

### Sessions/StartSession — `POST /api/sessions`

`StartSessionCommand(Guid PlayerId)` (PlayerId via `ICookieAuthService.ResolveOrCreatePlayerAsync(httpContext, ct)` appelé directement dans l'endpoint — **pas** `httpContext.GetPlayerId()`/le middleware, cf. Common/Auth : `StartSession` est le seul point d'entrée joueur qui crée un Player). Validator vide. `StartSessionHandler(db, CachedDeezerClient, SettingsService, DailyChallengeGenerator, logger)`.

- **Expiry paresseuse** : à chaque appel, toutes les sessions `Pending` du joueur dont `DailyChallenge.Date < today` basculent en `Abandoned` (`AbandonedAt=UtcNow`) avant tout traitement.
- **Génération paresseuse (filet de sécurité)** : si aucun `DailyChallenge` n'existe pour `today`, `TryLazyGenerateAsync` appelle `DailyChallengeGenerator.GenerateAsync` (déterministe, seed=`DayNumber` → même résultat que le scheduler minuit). Race avec le scheduler/un autre joueur → catch sur la contrainte unique `Date`, `db.ChangeTracker.Clear()`, relecture du défi créé par le concurrent. `PoolInsufficient` → **503**.
- **Reprise** : session existante pour (playerId, challengeId) → `Completed`→**409** `{error: already_played}`, `Abandoned`→**409** `{error: abandoned}`, `Pending`→reconstruit l'état (preview URLs, cover via `BuildCoverUrl`, `resumeFromPosition`, `CompletedAnswers`, `CurrentTrackId`/`CurrentTrackMinListenedSeconds` anti-cheat).
- Nouvelle session : crée `GameSession(Status=Pending, TotalScore=0)`, construit les `TrackSlot` (preview+cover) pour les N tracks du défi (ordre `Position`).
- **Response** : `StartSessionResponse(SessionId, Tracks, CurrentStreak, IsResuming, ResumeFromPosition, CompletedAnswers, CurrentTrackId?, MinListenedSeconds?)`. Codes : 200/409/503. Sur reprise, `ResumedAnswer.CorrectTitle` passe par `TextNormalizationHelpers.CleanDisplayTitle` (cf. Common/Text) — même titre que celui révélé au moment de la réponse initiale.

### Sessions/SubmitAnswer — `POST /api/sessions/{sessionId}/answers`

`SubmitAnswerCommand(PlayerId, SessionId, DailyChallengeTrackId, ListenedDurationSeconds, WasExtended, ArtistAnswer?, TitleAnswer?)`.

**Validator** (`SettingsService` résolu synchrone via `GetAwaiter().GetResult()`) : `ListenedDurationSeconds` doit être `0` OU dans `AllowedDurationsSeconds` ; `ArtistAnswer` max 200, `TitleAnswer` max 300.

**Handler** (`db, ScoreCalculator, TextNormalizer, SettingsService`) :
- Vérifs : session introuvable→404, `PlayerId` différent→403, `Status!=Pending`→403, track introuvable dans ce défi→404, déjà répondue→**409** `already_answered`.
- Correction via `TextNormalizer.IsMatch` (artiste et titre séparément), score via `ScoreCalculator.Calculate` — **basé uniquement sur le palier `ListenedDurationSeconds` finalement écouté**, `WasExtended` n'entre plus dans le calcul (cf. `ScoreCalculator` ci-dessous). `WasExtended` reste stocké sur `GameSessionAnswer` pour les stats admin (`ExtendedRate`).
- **Stats avant/après calculées en mémoire** : lit les stats agrégées déjà en base avant d'insérer la réponse courante, combine en mémoire — évite un aller-retour DB après `SaveChanges`.
- Réinitialise le verrou anti-cheat (`CurrentTrackId=null`, `CurrentTrackMinListenedSeconds=null`).
- **Détection de complétion** : réponses en base +1 (courante pas encore persistée) ≥ `TracksPerChallenge` et `Status==Pending` → `Completed`, `CompletedAt=UtcNow`.
- **Streak basée sur `DailyChallenge.Date`, jamais la date de complétion** (cf. piège 18 du CLAUDE.md racine) : `CurrentStreak = LastPlayedDate == challengeDate.AddDays(-1) ? +1 : 1`, `LastPlayedDate = challengeDate`.
- **Response** : `SubmitAnswerResponse(ArtistCorrect, TitleCorrect, Score, CorrectArtist, CorrectTitle, ListenedDurationSeconds, AverageSecondsWhenCorrect?, FailureRatePercent)` — `CorrectTitle` passe par `TextNormalizationHelpers.CleanDisplayTitle` (parenthèses/crochets retirés, cf. Common/Text) avant d'être renvoyé ; `challengeTrack.Title` (utilisé pour la comparaison `TextNormalizer.IsMatch` juste au-dessus) reste brut, sans impact sur le matching qui normalise déjà les parenthèses de son côté.

### Sessions/AbandonSession — `PUT /api/sessions/{sessionId}/abandon`

`AbandonSessionCommand(PlayerId, SessionId)`. 404 si introuvable, 403 si joueur différent, **400** `already_completed`/`already_abandoned` si état final déjà atteint, sinon `Status=Abandoned`, `AbandonedAt=UtcNow` → **204**.

### Sessions/UpdateListening — `PATCH /api/sessions/{sessionId}/listening`

`UpdateListeningCommand(PlayerId, SessionId, TrackId, ListenedSeconds)`. Validator : `ListenedSeconds` doit être dans `AllowedDurationsSeconds` (**pas de tolérance à 0**, contrairement à SubmitAnswer). Handler (verrou anti-cheat) : 404/403/**400** `session_not_pending`. Si `CurrentTrackId==TrackId` : met à jour `CurrentTrackMinListenedSeconds` **seulement si la nouvelle valeur est supérieure** (jamais réduire le minimum). Sinon (nouvelle track) : réinitialise les deux champs. → 204.

### Admin/Challenges/CreateChallenge — `POST /api/admin/challenges`

Validation manuelle dans l'endpoint (pas FluentValidation) : 1 à **3** `DeezerTrackIds` (littéral codé en dur dans l'endpoint — `body.DeezerTrackIds.Count > 3` —, pas dérivé de `TracksPerChallenge`/`SettingsService`, contrairement à `DailyChallengeGenerator` qui lit `settings.TracksPerChallenge` ; inoffensif tant que le défaut reste 3, mais à corriger si `TracksPerChallenge` devient un jour éditable), pas de doublons → 400 sinon. Handler (`db, DeezerClient`) : 409 si défi déjà présent pour `Date` ; réutilise le `Track` existant sinon fetch Deezer (**422** `invalid_track` si `null`) ; crée `DailyChallenge(Seed=Date.DayNumber)` + `DailyChallengeTrack(Position=i+1, DeezerRankSnapshot=i+1)`. Pas de gestion explicite de race condition ici (contrairement à `AddTrack`).

### Admin/Challenges/DeezerSearch — `GET /api/admin/deezer-search?q=`

`q` vide/<2 → `200 []`. Utilise `DeezerClient.SearchTracksAsync` **non caché** (contrairement à la recherche publique `/api/deezer/search`).

### Admin/Challenges/GetChallenges — `GET /api/admin/challenges`

Liste tous les `DailyChallenge` (desc par date) + tracks ordonnées par `Position`. `ChallengeDto(Id, Date, Tracks)` — `TrackDto.Title` passe par `TextNormalizationHelpers.CleanDisplayTitle` (cf. Common/Text), appliqué **après** matérialisation (`ToListAsync` sur un type anonyme intermédiaire, puis remapping en mémoire vers `ChallengeDto`/`TrackDto`) car une regex C# n'est pas traduisible dans la requête EF/SQL. Alimente la section « Historique » de l'onglet Défis admin — même nettoyage que `GetAdminStats` juste en dessous (section « Stats par défi », même onglet) : avant le 2026-08-17, seul `GetAdminStats` était nettoyé, ce qui affichait le même titre différemment selon la section.

### Admin/GenerateToday — `POST /api/admin/generate-today`

Appelle `DailyChallengeGenerator.GenerateAsync` : `Success`→200, `AlreadyExists`→**409**, `PoolInsufficient`→**422**.

### Admin/Login — `POST /api/admin/login` / `POST /api/admin/logout` / `GET /api/admin/me`

Authentification **volontairement minimale** : `LoginEndpoint` invoque `bus.InvokeAsync<IResult>(new LoginCommand(password))`, `LoginHandler.Handle` compare le password à `IConfiguration["AdminPassword"]`. Succès → `{token: "admin-token"}` (constante statique, **pas de JWT ni génération aléatoire**). `IsAdminAuthenticated(HttpContext)` : vérifie `Authorization: Bearer admin-token` — méthode statique utilisée par tous les endpoints Admin pour l'auto-protection.

### Admin/RefreshPreviews — `POST /api/admin/refresh-previews`

Délègue à `PreviewStatusRefresher.RefreshAsync` (voir ChallengeGeneration). `RefreshPreviewsResponse(Checked, Updated, Failed)`.

### Admin/ResetToday — `DELETE /api/admin/reset-today`

404 si pas de défi du jour. Supprime toutes les `GameSessions` liées (cascade sur `GameSessionAnswers`). Retourne `{deleted, date}`.

### Admin/Stats/GetAdminStats — `GET /api/admin/stats?date=`

Utilise `IDbContextFactory<ApplicationDbContext>` pour **5 requêtes en parallèle**, chacune avec son propre `DbContext` (non thread-safe sinon) : `BuildChallengeStats` (30 derniers défis, min/max/moyenne/médiane, stats par track — dont `ExtendedRate` = % des réponses de ce track avec `WasExtended=true`), `BuildDailyActivity` (30 jours glissants, 0 par défaut), `BuildPlayerBreakdown` (guests/registered/actifs 7j/30j, exclut `IsDeleted`), `BuildAvailableDates`, `BuildDailyKpis` (date sélectionnée — **jour passé : Pending compté comme Abandoned**, `CompletionRate` + médiane). Médiane calculée manuellement (tri + moyenne des 2 valeurs centrales si pair).

**`ChallengeStatsDto.Players`** (`IReadOnlyList<ChallengePlayerDto>`) — un `{PlayerId, Status, Score}` par `GameSession` du défi (toutes sessions, Completed/Pending/Abandoned confondues), pour que l'admin repère les joueurs qui reviennent d'un jour à l'autre (front : `ChallengesTabComponent`). `Status` est sérialisé en `string` (`s.Status.ToString()`), pas l'enum `SessionStatus` brut — évite toute ambiguïté int/string côté client généré par NSwag. `BuildChallengeStats` projette une seule fois `Sessions = c.GameSessions.Select(s => new {PlayerId, Status, TotalScore})` en DB, réutilisée en mémoire pour dériver `scores`/`pendingCount`/`abandonedCount` **et** `Players` — remplace les 3 requêtes séparées qui existaient avant (une par compteur).

`TrackStatsDto.Title` passe par `TextNormalizationHelpers.CleanDisplayTitle` (cf. Common/Text) lors du mapping en mémoire (après le `ToListAsync` de `BuildChallengeStats`) — alimente la section « Stats par défi » du même onglet Défis admin que `GetChallenges` ci-dessus (même nettoyage des deux côtés depuis le 2026-08-17).

### Admin/Tracks/AddTrack — `POST /api/admin/tracks`

Validator : `DeezerTrackId > 0`. Existe déjà avec données complètes → renvoyé tel quel ; existe mais incomplet → re-fetch Deezer et corrige ; sinon fetch (422 si `null`), crée le `Track`.

**Gestion de race condition explicite** :
```csharp
try { await db.SaveChangesAsync(); }
catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
{
    db.Entry(track).State = EntityState.Detached;
    // relit le track créé entre-temps par un appel concurrent, renvoie 200
}
```

### Admin/Tracks/DeleteTrack — `DELETE /api/admin/tracks/{id}`

404 si introuvable, **409** `track_in_use` si utilisé dans un `DailyChallengeTrack` (`DeleteBehavior.Restrict` en base de toute façon), sinon suppression.

### Admin/Tracks/GetTracks — `GET /api/admin/tracks`

`GetTracksHandler` : tri par `Artist`, projette `IsUsed = DailyChallengeTracks.Any()`, sépare `Available` (avec `HasPreview`) / `Used` (`HasPreview` toujours `null`). Ajoute par track `LastUsedDate`/`UsageCount` (colonnes réelles sur `Track`) et `UnlockDate` — **calculée à la volée** (`LastUsedDate?.AddDays(cooldownDays)`, jamais persistée), avec `cooldownDays` lu frais via `SettingsRawReader.GetIntAsync` (voir ChallengeGeneration ci-dessous).

### Admin/Settings/UpdateTrackCooldown — `PUT /api/admin/settings/track-cooldown-days`

Body `UpdateTrackCooldownBody(TrackCooldownDays)`. Validator : `TrackCooldownDays > 0`. `ExecuteUpdateAsync` direct sur la ligne `Settings` existante (pas d'upsert, la ligne est garantie par la migration seed) — **400** si validation échoue (converti par le middleware global `ValidationException` → 400 dans `Program.cs`, nécessaire car ce pattern d'endpoint invoque `bus.InvokeAsync` manuellement depuis un Minimal API, sans la conversion 400 automatique des endpoints Wolverine.Http natifs, non utilisés ici), **404** `setting_not_found` si la ligne est absente (défensif).

### Admin/Tracks/UpdateTrack — `PUT /api/admin/tracks/{id}`

Body `UpdateTrackBody(DeezerTrackId)`. 404 introuvable, **409** `track_in_use` si utilisé, **409** `deezer_id_taken` si le nouveau `DeezerTrackId` déjà pris par un autre track, **422** si Deezer ne renvoie rien, sinon met à jour Artist/Title/CoverHash/HasPreview.

### ChallengeGeneration (pas un endpoint)

- **`DailyChallengeGenerator.GenerateAsync`** → `enum GenerateResult { Success, AlreadyExists, PoolInsufficient }`. Pool candidats = `Tracks` avec `HasPreview==true` ET hors cooldown (`LastUsedDate == null` OU `LastUsedDate < today - TrackCooldownDays` — remplace l'ancienne exclusion à vie "jamais utilisé dans un défi", cf. Déjà implémenté racine "Cooldown de réutilisation des morceaux"). `TrackCooldownDays` lu frais en base via `Common/Settings/SettingsRawReader.GetIntAsync(db, "TrackCooldownDays", fallback, ct)` — **pas** `settingsService`/`IOptions<AppSettings>` (figé au boot), pour que l'édition admin s'applique dès la prochaine génération sans redémarrage. `n = TracksPerChallenge` (celui-ci reste lu via `settingsService`, figé au boot comme les autres settings — seul `TrackCooldownDays` a ce traitement spécial) ; `candidates.Count < n` → `PoolInsufficient` (log `LogError`, aucun assouplissement automatique du cooldown). **Sélection déterministe** : `Random(seed: today.DayNumber)`, Fisher-Yates in-place, `Take(n)`. Insertion en **transaction explicite** (`BeginTransactionAsync`) : crée `DailyChallenge` puis sauvegarde (obtient l'Id) puis `DailyChallengeTrack` (Position 1..n, `DeezerRankSnapshot=i+1`, cohérent avec `CreateChallengeHandler`), puis tamponne `LastUsedDate=today`/`UsageCount+=1` sur chaque track sélectionnée (même transaction), commit.
- **`DailySchedule`** : `NextUtcHour(hour)` (prochaine occurrence future de `HH:00` UTC), `DelayUntilAsync(targetUtc, ct)` — boucle `while (remaining > 0) await Task.Delay(remaining)` **corrige la dérive de `Task.Delay`** (horloge monotone, dérive NTP possible sur 24h) qui avait causé un réveil juste avant minuit → jour sans défi (cf. piège 19 racine). Ne jamais revenir à un `Task.Delay(delay)` brut pour ces plannings.
- **`GenerateDailyChallengeService : BackgroundService`** : boucle infinie, `RetryDelay=10min` si échec/PoolInsufficient, sinon replanifie à `NextUtcHour(0)`. Scope frais (`IServiceScopeFactory.CreateAsyncScope()`) à chaque itération.
- **`PreviewStatusRefresher.RefreshAsync`** : candidats = tracks non utilisés. **Rate limiting** : lots de `BatchSize=10`, `BatchDelay=1.5s` (Deezer ~50 req/5s → 10/1.5s ≈ 33 req/5s). Pour chaque track, `ProbePreviewAsync` ; `!Succeeded` (erreur réseau/quota) → `failed++`, **`HasPreview` non modifié** (état inconnu ≠ absence réelle — cf. piège 16 racine) ; succès → met à jour seulement si diffère.
- **`RefreshPreviewStatusService : BackgroundService`** : planifié tous les jours à `NextUtcHour(23)`.

### Deezer (feature publique, distincte d'`Infrastructure/Deezer`) — `GET /api/deezer/search?q=`

Publique (pas admin). Utilise **`CachedDeezerClient`**. `q` vide/<2 → `200 []`. Projection minimaliste `DeezerSearchResult(Artist, Title)` — pas d'ID ni preview exposés côté joueur.

**Nettoyage + déduplication des suggestions** (`SearchEndpoint.CleanAndDeduplicate`, interne) : sur-demande `FetchLimit=20` résultats bruts à Deezer (au lieu de 10) pour compenser la perte due à la dédup, retire les parenthèses/crochets du titre via `TextNormalizationHelpers.CleanDisplayTitle` (même regex que `TextNormalizer` pour la correction des réponses, `ParenthesesPattern()` — pas de regex dupliquée), collapse les espaces multiples laissés par le retrait, fallback sur le titre brut si le nettoyage donne une chaîne vide (titre entièrement parenthésé). Déduplique ensuite sur `(Artist, TitreNettoyé)` en `ToLowerInvariant()`, garde la **première occurrence** (l'ordre Deezer reflète déjà la pertinence), plafonne à `ResultLimit=10`. L'admin (`Admin/Challenges/DeezerSearch`, `DeezerClient.SearchTracksAsync` non caché) garde les titres bruts Deezer, nécessaires pour `Track.Title` en BDD. `CleanDisplayTitle` est aussi appliqué, hors de cet endpoint, à tout titre révélé au joueur/admin après coup (réponse, récap, "déjà joué", stats admin) — voir Déjà implémenté racine "Nettoyage des titres affichés au-delà de l'autocomplete".

### E2E (montée uniquement en environnement `Testing`)

- `DELETE /api/e2e/reset?deleteChallenge=&emptyPool=` : supprime `GameSessionAnswers`/`GameSessions` (`ExecuteDeleteAsync`), supprime tous les `Players` sauf le joueur dev fixe (`aaaaaaaa-0000-0000-0000-000000000001`). `emptyPool` passe tous les `HasPreview` à `false` — nécessaire depuis la génération paresseuse (supprimer juste le défi ne suffit plus, il renaîtrait au premier joueur).
- `POST /api/e2e/reseed` : purge complète (`IgnoreQueryFilters()` pour inclure les soft-deleted) puis `SeedData(db)`.
- **`SeedData`** (aussi appelée au démarrage Dev/Testing si `!db.Tracks.Any()`) : 55 tracks (IDs/CoverHash Deezer réels), 9 répartis sur 3 défis (J-2/J-1/aujourd'hui), reste = pool admin, `DeezerTrackId >= 9_000_000_000` → `HasPreview=false`. Joueur dev fixe `CurrentStreak=2`, `LastPlayedDate=today-1`, 2 `GameSession Completed` (J-2, J-1, `TotalScore=2550`).

### Players/GetCurrentPlayer — `GET /api/players/me`

Endpoint minimal, sur le même modèle que `Settings/GetSettings` (pas de Command/Handler, direct dans l'`Endpoint.cs`) : `Results.Ok(new GetCurrentPlayerResponse(ctx.GetPlayerId()))`. Publique (hors `/api/admin`, donc traversée par `PlayerAuthMiddleware` comme toute route non-admin) — aucune requête DB supplémentaire, se contente de relire le `PlayerId` déjà résolu par le middleware pour la requête courante. Sert au front admin à afficher/copier l'ID du navigateur courant (`BrowserIdComponent`) : le cookie `authToken` étant `HttpOnly` et chiffré (Data Protection), le `PlayerId` est structurellement illisible côté client sans repasser par le back.

### Settings/GetSettings — `GET /api/settings` (publique)

Renvoie directement `SettingsService.GetAsync()` → `AppSettings` sérialisé.

### Stats/Today — `GET /api/stats/today`

`PlayerId` lu depuis `httpContext.Items[PlayerHttpContextExtensions.PlayerIdKey]` (nullable en théorie, mais le middleware le pose toujours hors `/api/admin`/`/health`). Pas de défi du jour → réponse vide par défaut. `playerId` fourni → session `Completed` du jour → `YourScore` + réponses par position + `CurrentStreak`. **2 `DbContext` distincts via factory** pour paralléliser `scoresTask` (tous scores `Completed`) et `trackStatsTask` (`TotalAnswers`/`CorrectAnswers`/`AvgSecondsCorrect`, filtrés `Completed`), + `appSettingsTask`, `Task.WhenAll`. Médiane manuelle. `FailureRatePercent = round((1 - correct/total)*100, 1)`. `TrackStat.Title` passe par `TextNormalizationHelpers.CleanDisplayTitle` (cf. Common/Text) lors de la construction finale des `TrackStat` (après `Task.WhenAll`/matérialisation de `trackStatsTask`) — alimente l'accordéon de l'écran "déjà joué" côté front.

## Domain (entités EF)

| Entité | Champs clés | Relations |
|---|---|---|
| `Player` | `Id(Guid)`, `IsGuest`, `Pseudo?`, `Email?`, `AuthToken(Guid)`, `LastSeenAt?`, `CurrentStreak`, `LastPlayedDate(DateOnly?)`, `IsDeleted`, `DeletedAt?` | 1—N `GameSession` (cascade) |
| `Track` | `Id`, `DeezerTrackId(long)`, `Artist`, `Title`, `CoverHash?`, `HasPreview(default true)`, `UpdatedAt?`, `LastUsedDate(DateOnly?)`, `UsageCount(default 0)` | 1—N `DailyChallengeTrack` (restrict) |
| `DailyChallenge` | `Id`, `Date(DateOnly)`, `Seed(int)` | 1—N `DailyChallengeTrack` (cascade), 1—N `GameSession` (restrict) |
| `DailyChallengeTrack` | `Id`, `DailyChallengeId`, `TrackId`, `DeezerRankSnapshot`, `Position` | 1—N `GameSessionAnswer` (restrict) |
| `GameSession` | `Id`, `PlayerId`, `DailyChallengeId`, `TotalScore`, `TotalDurationSeconds(decimal)`, `Status(SessionStatus)`, `CompletedAt?`, `AbandonedAt?`, `CurrentTrackId?`, `CurrentTrackMinListenedSeconds(decimal?)` | 1—N `GameSessionAnswer` (cascade) |
| `GameSessionAnswer` | `Id`, `GameSessionId`, `DailyChallengeTrackId`, `ListenedDurationSeconds`, `WasExtended`, `ArtistAnswer?`, `TitleAnswer?`, `ArtistCorrect`, `TitleCorrect`, `Score` | — |
| `SessionStatus` (enum) | `Pending=0`, `Completed=1`, `Abandoned=2` | — |
| `Setting` | `Id`, `Key`, `Value`, `Description?`, `UpdatedAt` | — |

## Infrastructure/Persistence

### `ApplicationDbContext`

Implémente `IDataProtectionKeyContext` (clés persistées en base, cf. piège 17 racine). DbSets : `DataProtectionKeys`, `Players`, `Settings`, `Tracks`, `DailyChallenges`, `DailyChallengeTracks`, `GameSessions`, `GameSessionAnswers`.

### Configurations notables

- **`PlayerConfiguration`** : CHECK `CK_Players_GuestPseudo` (`(IsGuest=true AND Pseudo IS NULL) OR (IsGuest=false AND Pseudo IS NOT NULL)`) ; index unique `AuthToken` ; index unique filtré `Pseudo` (`WHERE IsGuest=false AND Pseudo IS NOT NULL`) ; index unique filtré `Email` ; index filtré `LastSeenAt`. **Query filter global** `!p.IsDeleted`.
- **`TrackConfiguration`** : `Artist` max 200, `Title` max 300, `CoverHash` max 64. Index unique `DeezerTrackId`.
- **`DailyChallengeConfiguration`** : index unique `Date`.
- **`DailyChallengeTrackConfiguration`** : FK `Track` Restrict ; index unique composite `(DailyChallengeId, Position)` et `(DailyChallengeId, TrackId)`.
- **`GameSessionConfiguration`** : FK `Player` cascade, `DailyChallenge` restrict. **Query filter** `!s.Player.IsDeleted`. Index unique `(PlayerId, DailyChallengeId)` (**anti-rejeu**). Index `(PlayerId, Status, DailyChallengeId)` = `IX_GameSessions_PlayerStatusChallenge`. Index `(DailyChallengeId, Status)` = `IX_GameSessions_ChallengeStatus`. Index leaderboard `(DailyChallengeId, TotalScore DESC, TotalDurationSeconds ASC)` avec `IncludeProperties(PlayerId)` (index couvrant).
- **`GameSessionAnswerConfiguration`** : FK `Track` restrict. **Query filter** `!a.GameSession.Player.IsDeleted`. Index unique `(GameSessionId, DailyChallengeTrackId)` (empêche double réponse).
- **`SettingConfiguration`** : index unique `Key`. **`HasData` seed** : les settings par défaut (voir tableau dans le CLAUDE.md racine) — `CoverUrlTemplate` (`Id=6`, inséré via migration `AddCoverUrlTemplateSetting` sans jamais avoir été ajouté au `HasData` — décalage historique, ne pas s'y fier pour deviner le prochain `Id` libre sans vérifier la base) et `TrackCooldownDays` (`Id=7`) en sont deux exemples.

### Migrations structurantes (historique, pas exhaustif)

`InitialCreate` → `UpdateTracksPerChallengeTo3` → `AddTrackCoverUrl`/`RenameCoverUrlToCoverHash` → `AddCoverUrlTemplateSetting` → `DecimalDurations` (int→numeric + migration des settings vers valeurs fractionnaires) → `PlayerStreak` → `SessionStatus` (+ migration données existantes du joueur dev en `Completed`) → `AddTrackHasPreview` → `AddSessionAntiCheat` → `AddPerformanceIndexes` → `PersistDataProtectionKeys` → `RemoveMaxExtensionsPerAnswerSetting` (`DeleteData` sur le Setting `Id=3`, jamais appliqué nulle part — cf. décision d'architecture racine) → `AddTrackCooldownAndUsageTracking` (`Track.LastUsedDate`/`UsageCount` + Setting `TrackCooldownDays` `Id=7` + backfill SQL brut des deux colonnes depuis l'historique `DailyChallengeTrack`/`DailyChallenge`).

**Règle** : `UpdateData` EF est insuffisant pour modifier des `Settings` déjà en base prod — utiliser `migrationBuilder.Sql("UPDATE ...")` (cf. décision d'architecture racine).

## Infrastructure/Deezer

### `DeezerClient` (accès direct, non caché)

- `GetPreviewUrlAsync` → délègue à `ProbePreviewAsync`.
- **`ProbePreviewAsync` → `DeezerPreviewProbe(bool Succeeded, string? PreviewUrl)`** : distingue "échec de requête" (`Succeeded=false`) de "vraie absence de preview" (`Succeeded=true, PreviewUrl=""`). **Deezer renvoie ses erreurs (quota, busy, track supprimé) en HTTP 200** avec `error.code`/`error.message` — `DeezerErrorCodeNoData=800` = track n'existe plus (absence déterminée), tout autre code (4=quota, 700=busy) → `Succeeded=false` (cf. piège 16 racine).
- `GetTrackInfoAsync` → `DeezerTrackInfo(Artist, Title, PreviewUrl, DeezerTrackId, CoverHash)` ou `null`.
- `SearchTracksAsync` → `[]` en cas d'erreur (jamais d'exception propagée sauf `OperationCanceledException`, re-thrown — cf. piège 13 racine).
- **`ExtractCoverHash`** : parse `.../images/cover/{hash}/250x250-...jpg`, extrait uniquement `{hash}`.

### `CachedDeezerClient` (cache mémoire, joueurs/public uniquement — **jamais admin ni `PreviewStatusRefresher`**)

`PreviewTtl=24h`, `SearchTtl=1h`, `SignatureSafetyMargin=1h`.
- `GetPreviewUrlAsync` : clé `deezer:preview:{id}`, **ne cache jamais une absence**. `ComputeTtl` extrait `exp=<unix>` de l'URL signée (regex `[?&~=]exp=(\d+)`) et borne le TTL : `ttl = min(PreviewTtl, expiration - now - SignatureSafetyMargin)` — cf. piège 14 racine (bug prod 2026-07-03, TTL fixe 24h > validité signature).
- `SearchTracksAsync` : clé `deezer:search:{limit}:{query normalisée}` (le `limit` fait partie de la clé depuis l'ajout du paramètre `limit` optionnel — `DeezerClient.SearchTracksAsync(query, ct, limit=10)`), ne cache que si résultats non vides.

### `FakeDeezerHandler` (Testing)

Remplace le vrai `HttpClient`. `/track/{id}` : preview vide si `id >= 9_000_000_000`, sinon URL `http://localhost:{E2E_FRONT_PORT ?? 5174}/test-audio.mp3`. Gère aussi `/search` (réponse par défaut à un seul morceau, ou déclencheur `dedup-test` → 3 variantes parenthésées + 1 morceau distinct) — détaillé dans la section `E2E` plus bas plutôt qu'ici, car c'est là que ce comportement est consommé par les tests.

## Common/Auth

- **`CookieAuthService`** : `CookieName="authToken"`, durée 90 jours. Deux méthodes distinctes sur `ICookieAuthService` :
  - `ResolveOrCreatePlayerAsync` : résout via `IDataProtector.Unprotect` (catch générique si falsifié/clé expirée → traité comme absent), sinon **crée** un invité (`IsGuest=true`) et pose le cookie. Réservé aux deux seuls points d'entrée qui doivent créer un Player : `StartSessionEndpoint` (démarrer une partie) et `GetCurrentPlayerEndpoint` (admin, cf. ci-dessous).
  - `TryResolvePlayerAsync` : même résolution, **ne crée jamais** de Player ni de cookie — retourne `null` si absent/invalide/inconnu. Met juste à jour `LastSeenAt` si un Player existant est trouvé.
  **Cookie conditionné à l'environnement** : `SameSite=Strict, Secure=false` en Dev/Testing ; `SameSite=None, Secure=true` sinon (cross-site prod — cf. piège 7 racine).
- **`PlayerAuthMiddleware`** : exécuté sur toutes les requêtes sauf `/api/admin` et `/health`, appelle `TryResolvePlayerAsync` (jamais `ResolveOrCreatePlayerAsync`) — **création paresseuse du Player** (2026-08-21) : un simple chargement de page (`/api/settings`, autocomplete Deezer, `/api/stats/today`...) ne crée plus de ligne en base, seul un vrai démarrage de partie le fait. Stocke `PlayerId` dans `httpContext.Items[PlayerHttpContextExtensions.PlayerIdKey]` **seulement si résolu** (sinon la clé est absente).
- **`PlayerHttpContextExtensions`** : `GetPlayerId` throw si absent (réservé aux endpoints qui opèrent sur une session déjà démarrée — `SubmitAnswer`/`AbandonSession`/`UpdateListening` — où un Player est garanti exister). `GetPlayerIdOrNull` retourne `null` sans throw, pour les endpoints accessibles à un visiteur n'ayant jamais joué (`Stats/Today`).
- **`GetCurrentPlayerEndpoint`** (`GET /api/players/me`) appelle `ResolveOrCreatePlayerAsync` directement (pas de dépendance au middleware) — seul usage actuel : `BrowserIdComponent` (admin), qui doit toujours avoir un ID navigateur affiché même si l'admin ne joue jamais. Ne pas généraliser cet appel à d'autres endpoints publics sans besoin explicite, ça recréerait la pollution corrigée ci-dessus.

## Common/Scoring — `ScoreCalculator`

```
Calculate(listenedDuration, artistCorrect, titleCorrect, durationScores):
  !artistCorrect && !titleCorrect → 0
  duration absente de durationScores → 0
  base = durationScores[duration]
  artistCorrect && titleCorrect → base
  sinon (un seul correct) → round(base * 0.5)
```
Lookup exact du palier (pas d'interpolation), pas de bonus streak/vitesse hors palier. **Pas de malus de prolongation** (décision du 2026-07-17, cf. `GAMEPLAY_RULES_FR.md`) : le score ne dépend que du palier finalement écouté, qu'il ait été atteint directement ou via « écouter plus » — `WasExtended` n'est plus un paramètre de `Calculate`, il reste seulement stocké sur `GameSessionAnswer` pour les stats admin.

## Common/Settings

Chargement en 3 couches, **une seule fois au démarrage** (pas de rafraîchissement live) :
1. **`AppDbConfigurationSource`/`AppDbConfigurationProvider`** : connexion Npgsql brute, `SELECT Key,Value FROM Settings`, peuple `{AppDb}:{Key}`. Try/catch englobant si DB injoignable → dictionnaire vide, defaults C# s'appliquent (cf. piège 8 racine).
2. **`AppSettings`** : POCO avec valeurs par défaut, `BuildCoverUrl(hash)` (remplace `{hash}`, `""` si `hash is null`).
3. **`AppSettingsPostConfigure : IPostConfigureOptions<AppSettings>`** : post-configure `AllowedDurationsSeconds` (parse CSV en `decimal[]`, `NumberStyles.Any`/Invariant, n'écrase le default que si au moins une valeur parsée) et `DurationScores` (parse `"palier:score,..."`).
4. **`SettingsService`** : wrapper `IOptions<AppSettings>`, `GetAsync()` = `Task.FromResult(options.Value)` (aucune requête DB à l'exécution).

**Exception volontaire — `SettingsRawReader`** (`Common/Settings/SettingsRawReader.cs`) : `GetIntAsync(db, key, fallback, ct)` lit directement `db.Settings` (requête EF fraîche, hors `IOptions`), réservé aux cas où une valeur doit refléter un changement admin sans redémarrage. Seul `TrackCooldownDays` l'utilise aujourd'hui, dans `DailyChallengeGenerator.GenerateAsync` et `GetTracksHandler.Handle` (pour calculer `UnlockDate`) — ne pas généraliser ce pattern à d'autres settings sans besoin explicite, ça contourne le principe "figé au boot" du reste du système.

## Common/Text

- **`TextNormalizationHelpers`** (interne) : `ParenthesesPattern()` (regex générée `[\(\[].*?[\)\]]`), `RemoveAccents` (`Normalize(FormD)` + filtre `NonSpacingMark` + `Normalize(FormC)`), `LevenshteinDistance` (matrice classique), `CleanDisplayTitle` (retire parenthèses/crochets + collapse espaces, fallback sur l'original si résultat vide — utilisé par l'autocomplete Deezer ET par tout titre affiché après coup au joueur/admin, cf. Déjà implémenté racine).
- **`TextNormalizer.IsMatch(given, expected, threshold=2)`** : normalise les deux chaînes (supprime parenthèses, minuscule, accents, ne garde que lettres/chiffres/espaces, tokenise, **filtre stop-words** `["the","le","la","les","un","une","de","du","des","and","et","feat","ft","vs"]`), match exact après normalisation → `true`, sinon `LevenshteinDistance <= threshold` (2 par défaut).

## Program.cs — pipeline et DI

**Ordre** : migration auto (`db.Database.Migrate()`) → seed conditionnel (Testing: purge puis reseed si vide ; Dev: seed si vide) → `MapOpenApi()` (Dev) → middleware global `catch (ValidationException)` → 400 (voir ci-dessous) → `UseCors` → `UseMiddleware<PlayerAuthMiddleware>` → `/health` (liveness, `{status, utc, build}` — `build` = date UTC de compilation via `AssemblyMetadataAttribute("BuildUtc")`, **format consommé par le badge front, ne pas casser la compat**) → `/health/ready` (tag `"ready"`, `AddDbContextCheck<ApplicationDbContext>`) → tous les `Map*` endpoints → `MapE2EReset()` seulement si `IsEnvironment("Testing")`.

**Middleware global de conversion `ValidationException` → 400** — tout endpoint Minimal API qui invoque un handler via `bus.InvokeAsync<IResult>(...)` (le pattern de ce repo, pas les endpoints Wolverine.Http natifs) ne bénéficie d'aucune conversion 400 automatique en cas d'échec FluentValidation : l'exception remonte brute. Ajouté lors de l'introduction d'`UpdateTrackCooldown` (premier endpoint testé en intégration avec une valeur invalide) mais corrige tous les endpoints existants (`AddTrack`, `UpdateTrack`, etc.) qui avaient le même trou de comportement.

**DI notable** :
- `AddDbContextFactory<ApplicationDbContext>` — permet aux handlers qui parallélisent (GetAdminStats, TodayStats) de créer un contexte dédié par requête (DbContext non thread-safe).
- Connection string : priorité `NF_INSECONDS_DB_POSTGRES_URI` (Northflank, converti via `BuildNpgsqlConnectionString`), fallback `ConnectionStrings:DefaultConnection`.
- `UseWolverine` : `ServiceLocationPolicy=AllowedButWarn`, `UseRuntimeCompilation()`, `UseFluentValidation()` (validators invoqués auto avant les handlers via le bus).
- CORS `"AllowAngular"` : origines depuis `Cors:AllowedOrigins`, `AllowCredentials()` (cookies cross-site).
- HttpClient Deezer : résilience standard (`AttemptTimeout=4s`, `TotalRequestTimeout=15s`, circuit breaker `SamplingDuration=30s`) hors Testing — évite qu'un appel lent bloque `StartSession` (timeout HttpClient défaut 100s sinon).
- Data Protection : `PersistKeysToDbContext<ApplicationDbContext>()` + `SetApplicationName("InSeconds")`.

**BackgroundServices** : `GenerateDailyChallengeService` (00:00 UTC, retry 10min) + `RefreshPreviewStatusService` (23:00 UTC) — tous deux via `DailySchedule.NextUtcHour`/`DelayUntilAsync` (anti-dérive, cf. piège 19 racine).

## Points d'attention pour un futur agent

1. Toute nouvelle route Admin doit appeler `LoginEndpoint.IsAdminAuthenticated(HttpContext)` pour l'auto-protection (pas de middleware d'auth ASP.NET global sur `/api/admin`).
2. `SettingsService` ne relit jamais la DB après le boot — un changement de `Settings` en base ne prend effet qu'après redémarrage du service, **sauf `TrackCooldownDays`** qui passe par `SettingsRawReader` (lecture fraîche, cf. Common/Settings) pour permettre l'édition à chaud depuis l'onglet Actions admin sans redémarrage. Ne pas étendre ce pattern à d'autres settings sans besoin explicite.

# CLAUDE.md — `InSeconds.Deezer`

Projet séparé (pas un sous-dossier d'`InSeconds.Api`) — premier pas vers un modular monolith, extrait car c'est le module le plus sûr à isoler : zéro dépendance entrante d'autre code du repo vers son intérieur (personne n'a besoin de connaître son fonctionnement interne), une seule dépendance sortante réelle côté `InSeconds.Api` (`Features/Deezer/SearchEndpoint.cs`, qui **reste** dans `InSeconds.Api` car c'est un endpoint HTTP, pas de l'infrastructure Deezer pure — sa dépendance à `Common/Text/TextNormalizationHelpers.CleanDisplayTitle` romprait la cohérence du module s'il partait aussi).

**Nom volontairement concret, pas générique** (`InSeconds.Deezer`, pas `InSeconds.MusicCatalog`) : le code reste Deezer-shaped (URLs de preview signées par le CDN Deezer, codes d'erreur Deezer, `DailyChallengeTrack.DeezerRankSnapshot` déjà dans le Domain d'`InSeconds.Api`) — un nom générique promettrait une portabilité vers un autre fournisseur que le code n'a pas, et rien dans le repo n'indique qu'un changement de fournisseur soit prévu.

## `DeezerClient` (accès direct, non caché)

- `GetPreviewUrlAsync` → délègue à `ProbePreviewAsync`.
- **`ProbePreviewAsync` → `DeezerPreviewProbe(bool Succeeded, string? PreviewUrl)`** : distingue "échec de requête" (`Succeeded=false`) de "vraie absence de preview" (`Succeeded=true, PreviewUrl=""`). **Deezer renvoie ses erreurs (quota, busy, track supprimé) en HTTP 200** avec `error.code`/`error.message` — `DefinitiveNoDataErrorCodes` (`HashSet<int>`, aujourd'hui `{800}` = "no data", track n'existe plus) liste les codes traités comme une absence déterminée ; tout code absent de ce set (4=quota, 700=busy, ou un futur code Deezer inconnu) → `Succeeded=false` (cf. piège 16 racine). Un futur code à traiter en absence déterminée s'ajoute au set, sans toucher à `ProbePreviewAsync`.
- `GetTrackInfoAsync` → `DeezerTrackInfo(Artist, Title, PreviewUrl, DeezerTrackId, CoverHash, ReleaseYear?)` ou `null`. `ReleaseYear` parsé depuis le champ Deezer `release_date` (format `yyyy-MM-dd`, `ExtractReleaseYear` — retourne `null` en silence si absent/format inattendu, jamais d'exception). `SearchTracksAsync` parse aussi `ReleaseYear` sur chaque résultat (même helper).
- `SearchTracksAsync` → `[]` en cas d'erreur (jamais d'exception propagée sauf `OperationCanceledException`, re-thrown — cf. piège 13 racine).
- **`ExtractCoverHash`** : parse `.../images/cover/{hash}/250x250-...jpg`, extrait uniquement `{hash}`.

## `CachedDeezerClient` (cache mémoire, joueurs/public uniquement — **jamais admin ni `PreviewStatusRefresher`**)

`PreviewTtl=24h`, `SearchTtl=1h`, `SignatureSafetyMargin=1h`.
- `GetPreviewUrlAsync` : clé `deezer:preview:{id}`, **ne cache jamais une absence**. `ComputeTtl` extrait `exp=<unix>` de l'URL signée (regex `[?&~=]exp=(\d+)`) et borne le TTL : `ttl = min(PreviewTtl, expiration - now - SignatureSafetyMargin)` — cf. piège 14 racine (bug prod 2026-07-03, TTL fixe 24h > validité signature).
- `SearchTracksAsync` : clé `deezer:search:{limit}:{query normalisée}` (le `limit` fait partie de la clé depuis l'ajout du paramètre `limit` optionnel — `DeezerClient.SearchTracksAsync(query, ct, limit=10)`), ne cache que si résultats non vides.

## `Testing/FakeDeezerHandler` (`InSeconds.Deezer.Testing`, `internal` — jamais référencé directement depuis `InSeconds.Api`)

Remplace le vrai `HttpClient`. `/track/{id}` : preview vide si `id >= 9_000_000_000`, sinon URL `http://localhost:{E2E_FRONT_PORT ?? 5174}/test-audio.mp3`. Renvoie systématiquement `"release_date": "2015-06-01"` (2026-09-18, ajouté avec le système d'indices) — `ReleaseYearRefresher`/`AddTrack`/`UpdateTrack` en test obtiennent donc toujours `ReleaseYear=2015`. Gère aussi `/search` (réponse par défaut à un seul morceau, ou déclencheur `dedup-test` → 3 variantes parenthésées + 1 morceau distinct) — consommé côté tests par la section E2E du CLAUDE.md backend.

## `DeezerServiceCollectionExtensions.AddDeezerHttpClient` — point d'entrée DI

Encapsule tout l'enregistrement (`IMemoryCache`, `CachedDeezerClient`, `HttpClient<DeezerClient>`, choix `FakeDeezerHandler`/résilience standard) derrière une seule méthode d'extension appelée depuis `InSeconds.Api/Program.cs` :
```csharp
builder.Services.AddDeezerHttpClient(
    useFakeHandler: builder.Environment.IsEnvironment("Testing"),
    baseUrl: builder.Configuration["Deezer:BaseUrl"] ?? "https://api.deezer.com");
```
`useFakeHandler: true` branche `FakeDeezerHandler` (reste `internal` au module, jamais exposé) ; `false` branche la résilience HTTP standard (`AttemptTimeout=4s`, `TotalRequestTimeout=15s`, `CircuitBreaker.SamplingDuration=30s` — évite qu'un appel Deezer lent ne bloque `StartSession`, timeout `HttpClient` par défaut = 100s sinon). `IMemoryCache` reçoit un `SizeLimit=2000` (conteneur prod à mémoire contrainte) — c'est le seul consommateur d'`IMemoryCache` de tout le backend, donc `AddMemoryCache` vit entièrement ici, pas dans `InSeconds.Api`.

## Consommateurs (dans `InSeconds.Api`, via `ProjectReference`)

`Features/Sessions/StartSession/Handler.cs` (`CachedDeezerClient.GetPreviewUrlAsync`), `Features/Admin/Challenges/DeezerSearch/Endpoint.cs` (`DeezerClient.SearchTracksAsync` non caché), `Features/Admin/Challenges/CreateChallenge/Handler.cs`, `Features/Admin/Tracks/AddTrack/Handler.cs`, `Features/Admin/Tracks/UpdateTrack/Handler.cs` (`DeezerClient.GetTrackInfoAsync`), `Features/ChallengeGeneration/PreviewStatusRefresher.cs` (`DeezerClient.ProbePreviewAsync`, batché/rate-limité), `Features/Deezer/SearchEndpoint.cs` (`CachedDeezerClient`, endpoint public).

## Tests

Restent dans `InSeconds.Api.UnitTests/Deezer/` (`DeezerClientTests.cs`, `CachedDeezerClientTests.cs`) — pas de projet de test dédié, coût de cérémonie disproportionné pour 2 fichiers. `InSeconds.Api.UnitTests.csproj` référence `InSeconds.Deezer.csproj` directement.

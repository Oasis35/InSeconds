# InSeconds — Liste des Tâches (MVP)

> Mis à jour le 2026-06-08 après analyse du code source.

## ✅ Bootstrap projet (DONE)

- [x] Repo Git initialisé
- [x] Structure dossiers `src/back/` + `src/front/` + `docs/`
- [x] Docker Compose : `inseconds.database` (PostgreSQL) + `inseconds.api` (.NET 10 hot-reload)
- [x] `docker-compose.dcproj` pour intégration F5 Visual Studio
- [x] README bilingue (FR + EN) + `CLAUDE.md` (conventions repo)
- [x] CI GitHub Actions : build back + front + check migrations EF
- [x] `.gitignore` complet (.NET + Angular + IDE + OS + secrets)

## ✅ Backend Setup (DONE)

- [x] Solution `InSeconds.slnx` (format XML, **pas** .sln)
- [x] Projet API `InSeconds.Api` (.NET 10, `nullable enable`, `ImplicitUsings`)
- [x] `global.json` avec `rollForward: latestFeature`
- [x] Packages : EF Core 10 (Npgsql), Wolverine 6.x (+ RuntimeCompilation + FluentValidation), FluentValidation 12, OpenApi
- [x] Structure dossiers vertical slice : `Features/`, `Domain/`, `Infrastructure/`, `Common/`
- [x] `appsettings.json` : connection string PostgreSQL + CORS + Deezer
- [x] `Program.cs` configuré : DbContext, Wolverine, CORS, OpenAPI, `/health`, auto-migration
- [x] Dockerfile dev (SDK + `dotnet watch` + polling watcher Windows)

## ✅ Modèles & Base de Données (DONE)

- [x] 7 entités : `Player`, `Track` (avec `CoverHash`), `DailyChallenge`, `DailyChallengeTrack`, `GameSession`, `GameSessionAnswer`, `Setting`
- [x] `ApplicationDbContext.cs` + 7 `IEntityTypeConfiguration<T>`
- [x] Index leaderboard `(DailyChallengeId, TotalScore DESC, TotalDurationSeconds)`
- [x] Contrainte CHECK `CK_Players_GuestPseudo` (invariant guest ⇔ pseudo)
- [x] Global query filter EF soft-delete Player (propagé en cascade)
- [x] Migrations appliquées : `InitialCreate`, `RenameCoverUrlToCoverHash`, `AddCoverUrlTemplateSetting`
- [x] Settings seed en BD : `GuessTimerSeconds`, `AllowedDurationsSeconds`, `MaxExtensionsPerAnswer`, `TracksPerChallenge`, `DurationScores`, `CoverUrlTemplate`

## ✅ Services Métier (Common) (DONE)

- [x] `TextNormalizer` (Levenshtein + normalisation accents/stop-words) + tests unitaires
- [x] `ScoreCalculator` (paliers discrets × scoring partiel × malus extension) + tests unitaires
- [x] `SettingsService` — wrapper `IOptions<AppSettings>` (singleton, calculé au démarrage)
- [x] `AppDbConfigurationSource` / `AppDbConfigurationProvider` — lit la table `Settings` via ADO.NET brut au boot, injecte sous préfixe `AppDb:` dans `IConfiguration`
- [x] `AppSettingsPostConfigure` — binding des types complexes (`int[]` CSV, `Dictionary<int,int>`)
- [x] `AppSettings` — classe avec initialiseurs (pas de `From()`, pas de `Default`)
- [x] Tests unitaires `AppSettingsBindingTests` (binding + valeurs par défaut + malformed)

## ✅ Auth (cookie HTTP-only) (DONE)

- [x] `CookieAuthService` + `ICookieAuthService` : résout ou crée un Player guest, cookie HttpOnly signé (Data Protection ASP.NET), `SameSite=None; Secure=true` en prod
- [x] `PlayerAuthMiddleware` : résolution automatique du Player courant sur chaque requête
- [x] Slice `Features/Auth/Me/` — `GET /api/auth/me`
- [x] Tests unitaires `CookieAuthService`
- [ ] Slice `Features/Auth/Register/` — `POST /api/auth/register { pseudo }` (promeut guest → inscrit)
- [ ] Validation pseudo : 3-20 chars, alphanumérique + `_`, unique
- [ ] Tests d'intégration : flux guest → promotion inscrit → reconnexion

## ✅ Vertical Slice — Sessions (DONE)

- [x] Slice `Features/Sessions/StartSession/`
- [x] Slice `Features/Sessions/SubmitAnswer/` (scoring serveur via TextNormalizer + ScoreCalculator)
- [x] Tests unitaires `StartSessionHandler` + `SubmitAnswerHandler`
- [ ] Tests d'intégration (Testcontainers)

## ✅ Intégration Deezer (DONE)

- [x] `DeezerClient` (`HttpClient` typed) : `GetPreviewUrlAsync(trackId)` + `SearchTracksAsync(query)`
- [x] Extraction `CoverHash` depuis l'URL Deezer (`ExtractCoverHash()`)
- [ ] Interface `IDeezerClient` (pour mockabilité dans les tests)
- [ ] Décorateur cache (IMemoryCache) — TTL court sur les URLs preview
- [ ] Gestion rate limit Deezer (50 req / 5 s) — retry avec backoff
- [ ] Tests unitaires (mock `HttpMessageHandler`)

## ✅ Générateur Défi Quotidien (DONE)

- [x] `DailyChallengeGenerator` : tire `TracksPerChallenge` morceaux depuis le pool, seed reproductible basé sur la date
- [x] `GenerateDailyChallengeService : BackgroundService` — déclenche à 3h UTC chaque jour
- [x] Tests unitaires `GenerateDailyChallengeTests`

## ✅ Page Admin (DONE)

- [x] Auth admin via `Authorization: Bearer` + `adminAuthInterceptor` Angular (localStorage)
- [x] Slice `Admin/Login` — génère un token JWT admin
- [x] Slice `Admin/Tracks/AddTrack` + `GetTracks` — gestion du pool de morceaux
- [x] Slice `Admin/Challenges/CreateChallenge` + `GetChallenges` — création défi manuel
- [x] Slice `Admin/Challenges/DeezerSearch` — recherche Deezer depuis l'admin
- [x] Slice `Admin/GenerateToday` — génère le défi du jour à la demande
- [x] Slice `Admin/ResetToday` — supprime le défi du jour (re-générabilité)

## ✅ Frontend Setup (DONE)

- [x] Angular 20 standalone + signals
- [x] Port 5173 (pas 4200)
- [x] Tailwind CSS v4 + SCSS
- [x] `HttpClient` provider avec `withFetch()` + `withInterceptors([adminAuthInterceptor])`
- [x] `environment.ts` + `environment.development.ts` (apiUrl), swap via `fileReplacements`
- [x] `SettingsService` front — charge les `Settings` BD au démarrage (`provideAppInitializer`)

## ✅ Frontend — Service Audio (DONE)

- [x] `AudioPlayerService` singleton signal-based (durée choisie)
- [x] `playsInline` activé (iOS), feedback haptique `navigator.vibrate`
- [ ] Tests unitaires `AudioPlayerService`
- [ ] Tests sur vrai appareil iOS (Safari) et Android (Chrome)

## ✅ Frontend — Composants UI Jeu (DONE)

- [x] `GameService` — `startToday()` + `submitAnswer()`, `withCredentials: true`
- [x] `GameComponent` — session, progression, score, récap final, gestion erreurs
- [x] `BlindRoundComponent` — choix palier, lecture, prolongation, saisie, timer 20s, feedback résultat
- [x] Inputs ≥ 16px, `touch-action: manipulation`
- [ ] Bouton "Voir le classement" dans le récap final (route manquante)

## 🚧 Vertical Slice — Leaderboard

- [ ] Slice `Features/Leaderboard/GetLeaderboard/`
  - `GET /api/leaderboard/{dailyChallengeId?}` (défaut = jour UTC courant)
  - Top 100, filtre `!Player.IsGuest`, exploit l'index `IX_GameSessions_Leaderboard`
  - Rang du joueur courant inclus (peut être hors top 100)
  - Tests unitaires

## 🚧 Frontend — Leaderboard

- [ ] `LeaderboardService` (`GET /api/leaderboard`)
- [ ] `LeaderboardComponent` — top 100, rang joueur courant, bandeau guest, bouton rafraîchir
- [ ] Route `/leaderboard/:dailyChallengeId?`
- [ ] Bouton "Voir le classement" dans le récap final de `GameComponent`

## 🚧 Frontend — Auth UI

- [ ] `LoginComponent` (modal ou page) — input pseudo + submit
- [ ] Affichage état en header : "Joueur invité" ou pseudo inscrit
- [ ] Promotion guest → inscrit : formulaire pseudo → `POST /api/auth/register`
- [ ] Gestion erreurs (pseudo déjà pris, format invalide)

## ✅ Interceptor joueur (DONE)

- [x] `HttpInterceptor` global `withCredentials: true` pour toutes les requêtes joueur (`playerAuthInterceptor` branché dans `app.config.ts`)

## ✅ NSwag (génération client TS) (DONE)

- [x] `nswag` installé comme devDependency (14.7.1)
- [x] `nswag.json` configuré → lit `/openapi/v1.json` → génère `src/app/api/api.generated.ts`
- [x] Script `npm run generate-api` (runtime Net100)
- [x] `ApiClient` enregistré dans `app.config.ts` (token `API_BASE_URL` → `environment.apiUrl`)
- [x] `api.generated.ts` exclu du `.gitignore` (regénéré à la demande)
- [ ] Quand l'OpenAPI backend est stabilisé : remplacer les interfaces locales admin + `GameService` par les types générés
  - Note : `SubmitAnswerResponse` généré manque `listenedDurationSeconds` et `failureRatePercent` — nécessite rebuild back + `npm run generate-api`

## 🚧 Tests

- [x] Tests unitaires : `TextNormalizer`, `ScoreCalculator`, `CookieAuthService`, `StartSessionHandler`, `SubmitAnswerHandler`, `AppSettingsBindingTests`, `GenerateDailyChallengeTests`
- [ ] Tests d'intégration back (Testcontainers) : flow StartSession → SubmitAnswer × N → leaderboard
- [ ] Tests d'intégration : contrainte UNIQUE (PlayerId, DailyChallengeId)
- [ ] Tests front Karma/Jasmine (`AudioPlayerService`, `GameService`)
- [ ] Tests E2E Playwright (flux complet 1 partie)

## 🚧 Déploiement & CI/CD

- [x] Déploiement Northflank (front + back + PostgreSQL addon)
- [x] Secrets prod (connection string, `AdminPassword`) via Northflank
- [x] CORS prod configuré
- [x] CI/CD : workflow GitHub Actions deploy automatique sur push `main`
- [ ] Smoke tests automatisés post-deploy

## 🚧 Contraintes Mobile

- [ ] Tests sur vrai appareil iOS (Safari + Chrome iOS)
- [ ] Tests sur vrai appareil Android (Chrome)
- [ ] `100dvh` partout (pas `100vh`)
- [ ] Vérifier audio en mode silencieux iOS
- [ ] Audit CSS responsive (mobile-first)

## 🚧 Polish & Launch

- [ ] Charte graphique / palette de couleurs (`@theme` Tailwind)
- [ ] Messages d'erreur user-friendly (404 "Pas de défi", 409 "Déjà joué", etc.)
- [ ] Audit accessibilité WCAG 2.1 AA (labels, focus, contrastes)
- [ ] Vérifier politique d'usage API Deezer (rate limits, CGU)
- [ ] RGPD : anonymisation au soft-delete (pas juste `IsDeleted=true`)
- [ ] Mentions légales + CGU minimales
- [ ] Smoke test E2E final sur prod

---

## Ordre suggéré pour la suite

```text
Leaderboard back (slice GET /api/leaderboard)
  ↓
Leaderboard front (composant + route /leaderboard)
  ↓
Auth Register (POST /api/auth/register — back + UI front)
  ↓
Tests d'intégration (Testcontainers)
  ↓
Smoke tests post-deploy
  ↓
Mobile (tests vrais appareils)
  ↓
Polish + Launch
```

---

## Effort estimé restant

| Groupe | Effort |
|--------|--------|
| Leaderboard (back + front) | 2 h |
| Auth Register (back + UI front) | 2 h |
| Tests d'intégration (Testcontainers) | 3 h |
| Smoke tests post-deploy | 1 h |
| Mobile (vrais appareils) | 2 h |
| Polish (couleurs, a11y, erreurs, RGPD) | 3 h |
| **TOTAL restant** | **~13 h** |

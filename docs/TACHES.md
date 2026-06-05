# InSeconds — Liste des Tâches (MVP)

> État au 2026-06-05. Les cases ✅ sont **réellement** faites dans le repo. Le reste est à venir.
> Mis à jour le 2026-06-05 après analyse du code source.

## ✅ Bootstrap projet (DONE)

- [x] Repo Git initialisé, branche `feat/Dev1`
- [x] Structure dossiers `src/back/` + `src/front/` + `docs/`
- [x] Docker Compose : `inseconds.database` (SQL Server 2025) + `inseconds.api` (.NET 10 hot-reload)
- [x] Healthcheck SQL réparé (`mssql-tools18` + `-C`)
- [x] `docker-compose.dcproj` pour intégration F5 Visual Studio
- [x] Bilingual README (FR + EN) + `CLAUDE.md` (conventions repo)
- [x] CI GitHub Actions : build back + front + check migrations EF (Dependabot supprimé)
- [x] `.gitignore` complet (.NET + Angular + IDE + OS + secrets)

## ✅ Backend Setup (DONE)

- [x] Solution `InSeconds.slnx` (format XML, **pas** .sln)
- [x] Projet API `InSeconds.Api` (.NET 10, `nullable enable`, `ImplicitUsings`)
- [x] `global.json` avec `rollForward: latestFeature`
- [x] Packages : EF Core 10 (SqlServer/Tools/Design), Wolverine 6.0.2 (+ EF + FluentValidation + **RuntimeCompilation**), FluentValidation 12, Microsoft.AspNetCore.OpenApi
- [x] Structure dossiers vertical slice : `Features/`, `Domain/`, `Infrastructure/Persistence/Configurations/`, `Infrastructure/Persistence/Migrations/`, `Infrastructure/Deezer/`, `Common/Scoring/`, `Common/Text/`
- [x] `appsettings.json` avec connection string PostgreSQL + section CORS + section Deezer
- [x] `Program.cs` configuré : DbContext, Wolverine (avec `UseRuntimeCompilation` + EFCore transactions + FluentValidation), FluentValidation auto-discovery, CORS pour `http://localhost:5173`, OpenAPI, endpoint `/health`, auto-migration au boot
- [x] Dockerfile dev (SDK base + `dotnet watch` + polling watcher Windows)

## ✅ Modèles & Base de Données (DONE)

- [x] Entité `Player.cs` (Guid Id, IsGuest, Pseudo?, Email?, AuthToken, CreatedAt, LastSeenAt, IsDeleted, DeletedAt)
- [x] Entité `Track.cs` (référentiel canonique, DeezerTrackId unique)
- [x] Entité `DailyChallenge.cs` (Date unique UTC, Seed pour audit)
- [x] Entité `DailyChallengeTrack.cs` (jonction Challenge ↔ Track + Position 1..10 + DeezerRankSnapshot)
- [x] Entité `GameSession.cs` (contrainte UNIQUE `PlayerId + DailyChallengeId`, TotalScore, TotalDurationSeconds)
- [x] Entité `GameSessionAnswer.cs` (ListenedDurationSeconds + WasExtended + ArtistCorrect + TitleCorrect + Score)
- [x] Entité `Setting.cs` (Key/Value/Description + données seed : GuessTimerSeconds=20, AllowedDurationsSeconds="1,2,3,5,10,15,30", MaxExtensionsPerAnswer=1, TracksPerChallenge=10)
- [x] `ApplicationDbContext.cs` (7 DbSets + `ApplyConfigurationsFromAssembly`)
- [x] 7 `IEntityTypeConfiguration<T>` séparés dans `Configurations/`
- [x] Index leaderboard `(DailyChallengeId, TotalScore DESC, TotalDurationSeconds) INCLUDE (PlayerId)`
- [x] Contrainte CHECK `CK_Players_GuestPseudo` (invariant guest ⇔ pseudo)
- [x] Global query filter EF pour soft-delete Player (propagé en cascade sur GameSession + GameSessionAnswer)
- [x] Index unique filtrés : Pseudo (inscrits seulement), Email (non-null), AuthToken
- [x] Migration `InitialCreate` créée et appliquée — base `InSeconds` opérationnelle avec 7 tables + seeds

## ✅ Services Métier (Common) (DONE)

- [x] Implémenter `TextNormalizer.cs` (Levenshtein + normalisation accents/stop-words)
- [x] Tests unitaires `TextNormalizer` (xUnit) — cas limites accents/casse/stop words
- [x] Implémenter `ScoreCalculator.cs` — paliers discrets × scoring partiel (artiste/titre séparés) × malus extension
- [x] Tests unitaires `ScoreCalculator`
- [x] Enregistrer services dans `Program.cs` (DI)
- [x] Créer `SettingsService` (lecture cachée des `Settings` BD avec refresh à chaud)

## 🚧 Auth (cookie HTTP-only) — v1 pseudo seul

- [x] `CookieAuthService` + `ICookieAuthService` : résout ou crée un Player guest, pose le cookie HttpOnly signé (Data Protection ASP.NET)
- [x] Tests unitaires `CookieAuthService`
- [ ] Middleware/filtre d'auth injecté dans le pipeline ASP.NET (résolution automatique du Player courant sur chaque requête)
- [ ] Slice `Features/Auth/Register/` — `POST /api/auth/register { pseudo }` qui promeut le `Player` courant
- [ ] Validation pseudo : 3-20 chars, alphanumérique + `_`, unique
- [ ] Slice `Features/Auth/Me/` — `GET /api/auth/me` renvoie `{ id, isGuest, pseudo? }`
- [ ] Tests d'intégration : flux guest → promotion inscrit → reconnexion

## ✅ Vertical Slice — Sessions (DONE)

- [x] Slice `Features/Sessions/StartSession/` — Endpoint, Command, Handler, Validator, Response
- [x] Slice `Features/Sessions/SubmitAnswer/` — Endpoint, Command, Handler (scoring serveur via TextNormalizer + ScoreCalculator), Validator, Response
- [x] Tests unitaires `StartSessionHandler` + `SubmitAnswerHandler`
- [ ] Tests d'intégration (Testcontainers)

## 🚧 Vertical Slice — Leaderboard

- [ ] Slice `Features/Leaderboard/GetLeaderboard/`
  - Endpoint `GET /api/leaderboard/{dailyChallengeId?}` (defaut = jour courant UTC)
  - Query + Handler : top 100 (filtre `!Player.IsGuest`, exploit l'index `IX_GameSessions_Leaderboard`), avec rang via `ROW_NUMBER() OVER (...)`
  - Renvoie aussi le rang/score du joueur courant (peut être null pour un guest)
  - Tests d'intégration

## 🚧 Intégration Deezer

- [x] `DeezerClient` (`HttpClient` typed) : `GetPreviewUrlAsync(trackId)` → GET `/track/{id}`, `SearchTracksAsync(query)` → GET `/search`
- [ ] Définir `IDeezerClient` (interface pour mockabilité)
- [ ] Méthodes manquantes : `GetTopTracksByGenreAsync(genreId, limit)`
- [ ] Décorateur `DeezerCacheDecorator` (IMemoryCache) — TTL court sur les URLs preview
- [ ] Gestion rate limit Deezer (50 req / 5 s) — retry avec backoff
- [ ] Gestion erreurs (404 morceau retiré, 5xx Deezer down)
- [ ] Tests unitaires (mock `HttpMessageHandler`)

## 🚧 Générateur Défi Quotidien

- [ ] `DailyChallengeGeneratorService : BackgroundService` dans `Features/DailyChallenge/Generate/`
- [ ] Tourne 1× par jour, vérifie si `DailyChallenge` existe pour aujourd'hui (UTC)
- [ ] Sinon : tire `Settings.TracksPerChallenge` morceaux depuis Deezer (top genres tournants, seed reproductible basé sur la date)
- [ ] Upsert dans `Tracks`, crée `DailyChallengeTracks` avec Position 1..N et `DeezerRankSnapshot`
- [ ] Sauvegarde + logging structuré
- [ ] Test : appeler manuellement le service, vérifier qu'un défi est généré correctement

## ✅ Frontend Setup (DONE)

- [x] `ng new InSeconds.Client` (Angular 20 standalone + signals)
- [x] Port pinné à 5173 (au lieu de 4200 — conflit Screlec/TimeTracker)
- [x] Tailwind CSS v4 + SCSS configurés
- [x] `HttpClient` provider avec `withFetch()`
- [x] `environment.ts` + `environment.development.ts` (apiUrl)
- [x] `fileReplacements` dans `angular.json`
- [x] Page d'accueil avec ping `/health` (badge OK/KO live)
- [ ] Définir une palette de couleurs cohérente (variables Tailwind via `@theme` ou config)
- [x] Configurer `HttpInterceptor` global pour l'auth admin (`adminAuthInterceptor` — Bearer token en localStorage)
- [ ] Configurer `HttpInterceptor` global pour `withCredentials: true` sur les requêtes joueur (pour l'instant géré manuellement dans `GameService`)

## ✅ Frontend — Service Audio (DONE)

- [x] `AudioPlayerService` singleton signal-based — modèle "durée choisie"
  - signals `state`, `listenedSeconds`, `extended`, computed `isIdle/isPlaying/isFinished`
  - `play(url, durationSeconds)`, `extend(nextDurationSeconds)`, `stop()`, `reset()`, `preloadNext(url)`
- [x] `playsInline` activé sur l'élément audio (critique iOS)
- [x] Feedback haptique `navigator.vibrate?.(50)` au stop
- [ ] Tests unitaires `AudioPlayerService`
- [ ] Tests sur vrai appareil iOS (Safari) et Android (Chrome)

## ✅ Frontend — Composants UI (DONE)

- [x] `GameService` — `startToday()` + `submitAnswer()`, `withCredentials: true`
- [x] `GameComponent` — chargement session, progression X/10, score accumulé, récap final, gestion `already_played` + erreur réseau
- [x] `BlindRoundComponent` — choix palier, lecture, prolongation, saisie artiste/titre, timer 20s, feedback résultat, bouton piste suivante
- [x] Inputs ≥ 16px (pas de zoom iOS), `touch-manipulation` sur les boutons
- [x] `SettingsService` front qui charge les `Settings` BD au démarrage (via `provideAppInitializer`)
- [ ] Bouton "Voir le classement" dans le récap final (route manquante)

## 🚧 Frontend — Leaderboard

- [ ] `LeaderboardService` (`GET /api/leaderboard`)
- [ ] `LeaderboardComponent`
  - Affichage top 100
  - Si l'utilisateur n'est pas dans le top : afficher son rang/score en bas avec un séparateur
  - Si l'utilisateur est un guest : afficher son score sans rang + bandeau "Crée un compte pour apparaître au classement"
  - Layout responsive (mobile-first)
  - Bouton rafraîchir
- [ ] Route `/leaderboard/:dailyChallengeId?` (defaut = aujourd'hui)

## 🚧 Frontend — Auth UI

- [ ] `LoginComponent` (modal ou page dédiée) — input pseudo + submit
- [ ] Affichage de l'état courant en header : "Joueur invité" ou pseudo de l'inscrit
- [ ] Promotion guest → inscrit : juste un formulaire pseudo, appelle `POST /api/auth/register`
- [ ] Gestion des erreurs (pseudo déjà pris, format invalide)

## 🚧 NSwag (génération client TS)

- [ ] Installer `npm install -D nswag`
- [ ] Créer `nswag.json` qui lit `http://localhost:5171/openapi/v1.json` et génère dans `src/app/api/`
- [ ] Ajouter script `npm run generate-api` au `package.json`
- [ ] Remplacer les services manuels (`GameService`, `LeaderboardService`) par les services générés
- [ ] Documenter la procédure de régénération après chaque changement d'API dans `CLAUDE.md`

## 🚧 Contraintes Mobile

- [x] Architecture Angular 20 standalone + signals (performance OK)
- [ ] `playsInline` sur `<audio>` ✓ (à intégrer dans `AudioPlayerService`)
- [ ] Premier `play()` toujours dans un user gesture (click)
- [ ] Utiliser `100dvh` au lieu de `100vh` dans les templates
- [ ] Inputs ≥ 16px de taille de police
- [ ] `touch-action: manipulation` sur les boutons interactifs
- [ ] Tester sur vrai appareil iOS (Safari + Chrome iOS)
- [ ] Tester sur vrai appareil Android (Chrome)
- [ ] Vérifier comportement mode silencieux iOS (l'audio doit jouer quand même avec un user gesture explicite)
- [ ] Audit CSS responsive (mobile-first dans toutes les vues)

## 🚧 Tests

- [x] Setup projet `InSeconds.Api.UnitTests` (xUnit + FluentAssertions) + intégré dans CI
- [x] Tests unitaires `TextNormalizer`
- [x] Tests unitaires `ScoreCalculator`
- [x] Tests unitaires `CookieAuthService`
- [x] Tests unitaires `StartSessionHandler` + `SubmitAnswerHandler`
- [ ] Setup projet `InSeconds.Api.IntegrationTests` avec **Testcontainers**
- [ ] Tests d'intégration : flow `StartSession` → `SubmitAnswer` × 10 → vérification leaderboard
- [ ] Tests d'intégration : contrainte UNIQUE (PlayerId, DailyChallengeId)
- [ ] Tests d'intégration : contrainte CHECK guest/pseudo
- [ ] Tests front Karma/Jasmine (services + composants)
- [ ] Tests E2E Cypress ou Playwright (flux complet 1 partie)
- [ ] Audit performance Lighthouse (mobile)

## 🚧 Déploiement

- [x] Choisir cible : **Northflank** (PostgreSQL addon + services conteneurisés front + back)
- [x] Adapter `environment.ts` (prod) avec l'URL backend Northflank
- [x] Configurer CORS prod (`appsettings.json` — origine front Northflank autorisée)
- [x] Secrets prod (connection string PostgreSQL, `AdminPassword`) via secrets Northflank
- [x] Auth admin : Bearer token via `Authorization` header (cookie cross-domain bloqué par Chrome)
- [ ] CI/CD : ajouter un workflow GitHub Actions de déploiement automatique sur push `main`
- [ ] Smoke tests automatisés sur l'environnement prod après deploy
- [ ] Monitorer logs jour 1 (Application Insights ou équivalent)

## 🚧 Polish & Documentation

- [ ] Charte graphique / couleurs InSeconds (palette dans `@theme` Tailwind)
- [ ] Messages d'erreur user-friendly (404 "Pas de défi aujourd'hui", 409 "Déjà joué aujourd'hui", etc.)
- [ ] Audit accessibilité WCAG 2.1 AA (labels, focus visible, contrastes, semantic HTML)
- [ ] Génération doc API automatique via OpenAPI/Scalar UI (`Scalar.AspNetCore`)
- [ ] Mettre à jour [`CLAUDE.md`](../CLAUDE.md) à chaque nouvelle convention adoptée
- [ ] Mettre à jour le README à chaque changement significatif de quick start

## 🚧 Launch

- [ ] Smoke test E2E final sur prod
- [ ] Vérifier disponibilité API Deezer (politique d'usage, rate limits)
- [ ] Vérifier RGPD : ajouter anonymisation au soft-delete (effacer pseudo/email, garder le score) — pas juste un flag `IsDeleted=true`
- [ ] Mentions légales + CGU minimales
- [ ] Récupérer feedback utilisateurs jour 1
- [ ] Planifier features V2 : OAuth Google, mode practice, stats personnelles, historique de défis passés, partage social, etc.

---

## Dépendances tâches (ordre suggéré)

```text
Bootstrap projet [✅ DONE]
  ↓
Backend Setup [✅ DONE]
  ↓
Modèles & BD [✅ DONE]
  ↓
Services Métier (TextNormalizer + ScoreCalculator + SettingsService)
  ↓
Auth (cookie + middleware)
  ↓
Vertical Slice Sessions (StartSession → SubmitAnswer)
  ├→ Vertical Slice Leaderboard (peut tourner en parallèle)
  └→ Intégration Deezer + Générateur défi (peut tourner en parallèle)
  ↓
NSwag setup + génération client TS
  ↓
Frontend AudioPlayerService + GameComponent + BlindRoundComponent
  ├→ LeaderboardComponent (parallèle)
  └→ Auth UI (parallèle)
  ↓
Contraintes mobile (vérif sur vrais appareils)
  ↓
Tests (unitaires + intégration + E2E)
  ↓
Déploiement
  ↓
Polish + Launch
```

---

## Effort estimé restant (mis à jour 2026-05-29)

| Groupe | Effort | Notes |
| ------ | ------ | ----- |
| ~~Services Métier (Normalizer + Scoring)~~ | ~~3 h~~ | ✅ DONE |
| ~~Slice Sessions (Start + Submit)~~ | ~~4 h~~ | ✅ DONE |
| ~~AudioPlayerService~~ | ~~2 h~~ | ✅ DONE |
| ~~GameComponent + BlindRoundComponent~~ | ~~4 h~~ | ✅ DONE |
| ~~Tests unitaires Common + Sessions~~ | ~~2 h~~ | ✅ DONE |
| SettingsService back + front | 1 h | Lecture BD + signals Angular |
| Auth middleware + Register + Me | 1.5 h | Middleware pipeline + 2 slices |
| Slice Leaderboard | 1.5 h | Query optimisée, déjà indexée |
| Intégration Deezer (IDeezerClient + méthodes manquantes + cache + rate limit) | 2.5 h | HTTP + retry |
| Générateur défi (BackgroundService) | 2 h | Tirage seedé + upsert |
| NSwag setup | 0.5 h | Config + script npm |
| LeaderboardComponent + Auth UI | 3 h | Fetch + responsive + modal |
| Contraintes mobile (tests vrais appareils) | 2 h | iOS + Android |
| Tests intégration Testcontainers + E2E | 4 h | Couverture critique |
| Déploiement Railway / Azure | 2 h | Premier déploiement |
| Polish (couleurs, a11y, erreurs, docs) | 2 h | Détails finis |
| **TOTAL restant** | **~21 h** | ~15 h déjà livrés depuis le bootstrap |

---

## ✅ Termine quand…

- [ ] Toutes les tâches ci-dessus cochées
- [ ] Déploiement production OK et stable
- [ ] Flux E2E testé sur mobile (vrai appareil iOS + Android)
- [ ] CI au vert
- [ ] Code propre sur GitHub
- [ ] Au moins 1 défi quotidien généré automatiquement et jouable de bout en bout

🎉 **InSeconds MVP livré !**

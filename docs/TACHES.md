# InSeconds — Liste des Tâches (MVP)

> État au 2026-05-29. Les cases ✅ sont **réellement** faites dans le repo. Le reste est à venir.

## ✅ Bootstrap projet (DONE)

- [x] Repo Git initialisé, branche `feat/Dev1`
- [x] Structure dossiers `src/back/` + `src/front/` + `docs/`
- [x] Docker Compose : `inseconds.database` (SQL Server 2025) + `inseconds.api` (.NET 10 hot-reload)
- [x] Healthcheck SQL réparé (`mssql-tools18` + `-C`)
- [x] `docker-compose.dcproj` pour intégration F5 Visual Studio
- [x] Bilingual README (FR + EN) + `CLAUDE.md` (conventions repo)
- [x] CI GitHub Actions : build back + front + check migrations EF + Dependabot
- [x] `.gitignore` complet (.NET + Angular + IDE + OS + secrets)

## ✅ Backend Setup (DONE)

- [x] Solution `InSeconds.slnx` (format XML, **pas** .sln)
- [x] Projet API `InSeconds.Api` (.NET 10, `nullable enable`, `ImplicitUsings`)
- [x] `global.json` avec `rollForward: latestFeature`
- [x] Packages : EF Core 10 (SqlServer/Tools/Design), Wolverine 6.0.2 (+ EF + FluentValidation + **RuntimeCompilation**), FluentValidation 12, Microsoft.AspNetCore.OpenApi
- [x] Structure dossiers vertical slice : `Features/`, `Domain/`, `Infrastructure/Persistence/Configurations/`, `Infrastructure/Persistence/Migrations/`, `Infrastructure/Deezer/`, `Common/Scoring/`, `Common/Text/`
- [x] `appsettings.json` avec connection string SQL Server + section CORS + section Deezer
- [x] `Program.cs` configuré : DbContext, Wolverine (avec `UseRuntimeCompilation` + EFCore transactions + FluentValidation), FluentValidation auto-discovery, CORS pour `http://localhost:5172`, OpenAPI, endpoint `/health`, auto-migration au boot
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

## 🚧 Services Métier (Common)

- [ ] Implémenter `TextNormalizer.cs` (Levenshtein + normalisation accents/stop-words)
- [ ] Tests unitaires `TextNormalizer` (xUnit) — cas limites : "feat.", "&", accents, casse, stop words FR/EN
- [ ] Implémenter `ScoreCalculator.cs` — formule adaptée au modèle **durée choisie** (paliers discrets, pas de mesure ms) × bonus difficulté (`DeezerRankSnapshot`) × scoring partiel (artiste OK seul, titre OK seul, les deux)
- [ ] Tests unitaires `ScoreCalculator` — tous paliers × tous niveaux difficulté × tous cas de scoring partiel
- [ ] Enregistrer services dans `Program.cs` (DI)
- [ ] Créer `SettingsService` (lecture cachée des `Settings` BD avec refresh à chaud)

## 🚧 Auth (cookie HTTP-only) — v1 pseudo seul

- [ ] Middleware d'auth qui lit le cookie `authToken`, résout le `Player` courant, le rend disponible via DI (`ICurrentPlayer`)
- [ ] Si pas de cookie : créer automatiquement un `Player { IsGuest=true, AuthToken=Guid.NewGuid() }` et poser le cookie HttpOnly signé (Data Protection ASP.NET)
- [ ] Slice `Features/Auth/Register/` — `POST /api/auth/register { pseudo }` qui promeut le `Player` courant (IsGuest=false, Pseudo=...) en gardant l'historique
- [ ] Validation pseudo : 3-20 chars, alphanumérique + `_`, unique (déjà couvert par l'index)
- [ ] Slice `Features/Auth/Me/` — `GET /api/auth/me` renvoie `{ id, isGuest, pseudo? }` pour que le front sache qui il est
- [ ] Tests d'intégration : flux guest → promotion inscrit → reconnexion

## 🚧 Vertical Slice — Sessions

- [ ] Slice `Features/Sessions/StartSession/`
  - Endpoint `POST /api/sessions` (Minimal API)
  - Command + Handler Wolverine : vérifie contrainte UNIQUE (1 partie/jour/joueur), crée GameSession, renvoie session ID + métadonnées tracks (sans artist/title — éviter le leak)
  - Validator FluentValidation
  - Tests d'intégration (Testcontainers)
- [ ] Slice `Features/Sessions/SubmitAnswer/`
  - Endpoint `POST /api/sessions/{sessionId}/answers`
  - Command : `trackId, listenedDurationSeconds, wasExtended, artistAnswer?, titleAnswer?`
  - Handler : valide que `listenedDurationSeconds` ∈ `Settings.AllowedDurationsSeconds`, calcule scoring serveur (TextNormalizer + ScoreCalculator), persiste l'answer
  - Renvoie `{ artistCorrect, titleCorrect, score, correctArtist, correctTitle }` (révèle la solution après réponse)
  - Validator FluentValidation (palier dans liste autorisée, etc.)
  - Tests d'intégration

## 🚧 Vertical Slice — Leaderboard

- [ ] Slice `Features/Leaderboard/GetLeaderboard/`
  - Endpoint `GET /api/leaderboard/{dailyChallengeId?}` (defaut = jour courant UTC)
  - Query + Handler : top 100 (filtre `!Player.IsGuest`, exploit l'index `IX_GameSessions_Leaderboard`), avec rang via `ROW_NUMBER() OVER (...)`
  - Renvoie aussi le rang/score du joueur courant (peut être null pour un guest)
  - Tests d'intégration

## 🚧 Intégration Deezer

- [ ] Définir `IDeezerClient` dans `Infrastructure/Deezer/`
- [ ] Implémentation `DeezerClient` (`HttpClient` typed) :
  - `GetTrackAsync(trackId)` → GET `/track/{id}`
  - `GetTopTracksByGenreAsync(genreId, limit)` → GET `/chart/{genreId}/tracks`
  - `SearchAsync(query)` → GET `/search?q=...`
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

## 🚧 Frontend Setup — restant

- [x] `ng new InSeconds.Client` (Angular 20 standalone + signals)
- [x] Port pinné à 5172 (au lieu de 4200 — conflit Screlec/TimeTracker)
- [x] Tailwind CSS v4 + SCSS configurés
- [x] `HttpClient` provider avec `withFetch()`
- [x] `environment.ts` + `environment.development.ts` (apiUrl)
- [x] `fileReplacements` dans `angular.json`
- [x] Page d'accueil avec ping `/health` (badge OK/KO live)
- [ ] Définir une palette de couleurs cohérente (variables Tailwind via `@theme` ou config)
- [ ] Configurer `HttpInterceptor` (ou option globale) pour `withCredentials: true` quand l'auth cookie sera là

## 🚧 Frontend — Service Audio (critique UX)

- [ ] `AudioPlayerService` singleton signal-based — **modèle "durée choisie"** (pas de mesure)
  - signal `state: 'idle' | 'loading' | 'playing' | 'finished'`
  - signal `listenedSeconds`, `extended`
  - `play(url, durationSeconds)` → lance audio, `setTimeout` pour arrêt automatique exact
  - `extend(nextDurationSeconds)` → prolonge **une seule fois** (passe au palier supérieur)
  - `stop()` → renvoie `{ listenedSeconds, wasExtended }`
  - `reset()` → réinitialise pour la piste suivante
  - `preloadNext(url)` → précharge la piste suivante (`<link rel="preload" as="audio">`)
- [ ] `playsInline` activé sur l'élément audio (critique iOS)
- [ ] Tests : palier 3s écouté → stop à 3 ± 0.1s, prolongation 3s→5s → stop à 5s total, etc.
- [ ] Tests sur vrai appareil iOS (Safari) et Android (Chrome)

## 🚧 Frontend — Composants UI

- [ ] `SettingsService` qui charge les `Settings` BD au démarrage et expose des signals (`allowedDurations`, `guessTimerSeconds`, `maxExtensions`, `tracksPerChallenge`)
- [ ] `GameService` qui appelle l'API (`POST /sessions`, `POST /sessions/:id/answers`) — typage manuel au début, à remplacer par client NSwag plus tard
- [ ] `GameComponent` (conteneur)
  - Au mount : `GameService.startToday()` → charge les tracks
  - Tracker l'index courant 0..9
  - Afficher progression (X / 10) et score total accumulé
  - Quand une réponse arrive (`(answered)`), appel API, met à jour score, passe à la piste suivante
  - À la fin : affichage récap + bouton "Voir le classement"
- [ ] `BlindRoundComponent` (UI 1 piste)
  - États : `idle` (choisir palier), `playing` (en écoute + bouton "Prolonger"), `finished` (saisir artiste/titre + timer 20s)
  - Affichage statique "À 3s : jusqu'à 800 pts" (pas de compteur temps réel)
  - Inputs artiste + titre (≥ 16px pour éviter zoom iOS)
  - Bouton Submit + feedback haptique (`navigator.vibrate?.(50)`)
  - Timer de saisie configurable (`SettingsService.guessTimerSeconds`)
  - Désactiver les inputs pendant la lecture
- [ ] Flux complet : choisir palier → écouter → (éventuellement prolonger) → saisir → submit → piste suivante

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

- [ ] Setup projet de tests `InSeconds.Api.UnitTests` (xUnit + FluentAssertions)
- [ ] Tests unitaires `TextNormalizer` (cas limites accents/stop-words/casse)
- [ ] Tests unitaires `ScoreCalculator` (tous paliers × tous scoring)
- [ ] Setup projet `InSeconds.Api.IntegrationTests` avec **Testcontainers** (lance SQL Server 2025 automatiquement)
- [ ] Tests d'intégration : flow `StartSession` → `SubmitAnswer` × 10 → vérification leaderboard
- [ ] Tests d'intégration : contrainte UNIQUE (PlayerId, DailyChallengeId) — tenter de start 2× le même jour
- [ ] Tests d'intégration : contrainte CHECK guest/pseudo — tenter de violer
- [ ] Tests front Karma/Jasmine (services + composants)
- [ ] Tests E2E Cypress ou Playwright (flux complet 1 partie)
- [ ] Audit performance Lighthouse (mobile)

## 🚧 Déploiement

- [ ] Choisir cible : Railway (simple, SQL Server inclus) ou Azure App Service + Azure SQL
- [ ] Adapter `environment.ts` (prod) avec l'URL backend de prod
- [ ] Configurer reverse proxy ou stratégie CORS prod
- [ ] Secrets prod (connection string, etc.) via Key Vault / secrets Railway
- [ ] CI/CD : ajouter un workflow GitHub Actions de déploiement sur push `main`
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

## Effort estimé restant (au 2026-05-29)

| Groupe | Effort | Notes |
|--------|--------|-------|
| Services Métier (Normalizer + Scoring + Settings) | 3 h | Logique pure, testable isolément |
| Auth cookie + middleware | 2 h | Pseudo seul, géré par Data Protection |
| Slice Sessions (Start + Submit) | 4 h | Cœur du gameplay, tests d'intégration |
| Slice Leaderboard | 1.5 h | Query optimisée, déjà indexée |
| Intégration Deezer (client + cache + rate limit) | 3 h | HTTP + retry |
| Générateur défi (BackgroundService) | 2 h | Tirage seedé + upsert |
| NSwag setup | 0.5 h | Config + script npm |
| AudioPlayerService (modèle durée choisie) | 2 h | Plus simple que la v0 (pas de RAF) |
| GameComponent + BlindRoundComponent | 4 h | UI 10 pistes + timer saisie + prolongation |
| LeaderboardComponent | 1.5 h | Fetch + responsive |
| Auth UI (login + promotion guest→inscrit) | 1.5 h | Modal simple |
| Contraintes mobile (tests vrais appareils) | 2 h | iOS + Android |
| Tests (unitaires + intégration Testcontainers + E2E) | 5 h | Couverture critique |
| Déploiement Railway / Azure | 2 h | Premier déploiement |
| Polish (couleurs, a11y, erreurs, docs) | 2 h | Détails finis |
| **TOTAL restant** | **~36 h** | + ce qui est déjà fait (~10 h de bootstrap) |

---

## ✅ Termine quand…

- [ ] Toutes les tâches ci-dessus cochées
- [ ] Déploiement production OK et stable
- [ ] Flux E2E testé sur mobile (vrai appareil iOS + Android)
- [ ] CI au vert
- [ ] Code propre sur GitHub
- [ ] Au moins 1 défi quotidien généré automatiquement et jouable de bout en bout

🎉 **InSeconds MVP livré !**

# InSeconds — Liste des Tâches

> Mis à jour le 2026-06-20.

## ✅ Bootstrap projet

- [x] Repo Git, structure `src/back/` + `src/front/` + `docs/`
- [x] Docker Compose : `inseconds.database` (PostgreSQL) + `inseconds.api` (.NET 10 hot-reload)
- [x] README bilingue (FR + EN) + `CLAUDE.md`
- [x] CI GitHub Actions : build back + front + check migrations EF + tests unitaires + tests d'intégration + E2E Playwright

## ✅ Backend

- [x] Solution `InSeconds.slnx` (format `.slnx` obligatoire)
- [x] Vertical slice architecture (Features / Domain / Infrastructure / Common)
- [x] 7 entités + configurations EF + migrations PostgreSQL
- [x] Settings chargés depuis la BD via `AppDbConfigurationSource` → `IOptions<AppSettings>`
- [x] `TextNormalizer` (Levenshtein) + tests unitaires
- [x] `ScoreCalculator` (paliers `decimal`, scoring partiel, malus prolongation) + tests unitaires
- [x] `CookieAuthService` — guest auto, cookie HttpOnly `SameSite=None` en prod
- [x] `DeezerClient` — recherche + preview + extraction `CoverHash`
- [x] `BackgroundService` génération défi quotidien (3h UTC)
- [x] Slice `Sessions/StartSession` + `Sessions/SubmitAnswer` (scoring serveur + stats)
- [x] Slice `Sessions/AbandonSession` — `PUT /api/sessions/{id}/abandon`, marque une session Pending comme abandonnée
- [x] `SessionStatus` enum (Pending=0, Completed=1, Abandoned=2) — session comptabilisée seulement si complétée ou abandonnée
- [x] Reprise de partie — `StartSession` retourne `IsResuming=true` + `CompletedAnswers` si session Pending existante
- [x] Expiry paresseuse — sessions Pending du jour précédent passées à Abandoned au prochain `StartSession`
- [x] Slice `Stats/Today` — score joueur, médiane (`PERCENTILE_CONT(0.5)`), stats par morceau
- [x] Page admin : login Bearer, pool morceaux, création défis, reset sessions
- [x] `ListenedDurationSeconds` / `TotalDurationSeconds` en `decimal` (paliers 0.5, 1, 1.5, 2, 3, 5, 10)
- [x] Tests unitaires back : `TextNormalizer`, `ScoreCalculator`, `CookieAuthService`, `PlayerAuthMiddleware`, `AppSettingsBinding`, `StartSessionHandler`, `SubmitAnswerHandler`, `GenerateDailyChallengeService`, `AddTrackHandler`, `MeEndpoint`, `GetTracksHandler`, `SubmitAnswerValidator`
- [x] Streak joueur : `Player.CurrentStreak` + `Player.LastPlayedDate`, mis à jour dans `SubmitAnswer/Handler.cs` à la complétion (parties complètes uniquement)
- [x] Morceaux sans preview : `SubmitAnswerValidator` accepte `ListenedDurationSeconds = 0` (skip), `BlindRoundComponent` affiche un bouton "Passer" si `previewUrl` est vide
- [x] `Track.HasPreview` persisté en base (migration `AddTrackHasPreview`) — flag mis à jour à l'ajout/actualisation d'un track et nuitamment par `RefreshPreviewStatusService` (2h UTC)
- [x] `RefreshPreviewStatusService` — `BackgroundService` qui vérifie Deezer pour tous les tracks disponibles à 2h UTC et met à jour `HasPreview`
- [x] `DailyChallengeGenerator` filtre sur `Track.HasPreview` en DB (plus d'appel Deezer à la génération), shuffle Fisher-Yates avec seed déterministe, transaction explicite autour des deux `SaveChangesAsync`
- [x] `GenerateResult` enum (`Success`/`AlreadyExists`/`PoolInsufficient`) — `POST /api/admin/generate-today` retourne `422 pool_insufficient` distinct du `409 already_exists`
- [x] `GetTracksHandler` lit `HasPreview` depuis la DB (plus d'appel Deezer au chargement du pool admin)
- [x] `GET /api/admin/stats` — dashboard admin : activité 30 jours, répartition joueurs, stats par défi
- [x] Page admin — Pool : tableau paginé (15 lignes/page), filtres combinables (texte, statut, preview), indicateur preview (vert/rouge) via `TrackDto.HasPreview`, popup d'ajout avec recherche Deezer + lecteur preview 30s
- [x] Suppression d'un morceau du pool depuis la page admin (`DELETE /api/admin/tracks/{id}`) — interdit si utilisé dans un défi, confirmation modale, sélection multiple
- [x] Actualisation d'un morceau sans preview (`PUT /api/admin/tracks/{id}`) — bouton "↻ Actualiser" ouvre la modale en mode update, écrase DeezerTrackId/Artist/Title/CoverHash
- [x] Pool admin redesigné en tableau paginé (15 lignes/page), filtres combinables (texte, statut, preview), sous-onglets supprimés, onglet "Actions" dédié (générer défi + reset sessions)
- [x] Seed enrichi : 5 morceaux sans preview (The Beatles, Pink Floyd, Bob Dylan, Led Zeppelin, Fleetwood Mac — IDs >= `9_000_000_000`) pour tester le flux "↻ Actualiser"
- [x] Dashboard admin redesigné : KPI tiles jour sélectionné (complétés, abandons, taux de complétion, score médian), sélecteur de jour (← → sur les dates ayant un défi), barres 30j cliquables (jours sans activité affichés à zéro), `GET /api/admin/stats?date=` (param date, `AvailableDates`, `SelectedDayKpis`, Pending→Abandoned pour les jours passés)

## ✅ Frontend

- [x] Angular 20 standalone + signals, Tailwind v4, port 5173
- [x] `SettingsService` — charge les Settings BD au boot, expose des signals
- [x] `AudioPlayerService` — modèle "durée choisie", signal-based
- [x] `GameComponent` — session complète, récap final avec liens Deezer
- [x] `BlindRoundComponent` — choix palier, lecture, prolongation, timer, feedback stats
- [x] `AdminComponent` — login, pool, défis, recherche Deezer
- [x] `playerAuthInterceptor` + `adminAuthInterceptor`
- [x] NSwag : `ApiClient` généré, `api.generated.ts` commité
- [x] Pages d'erreur : 404, "déjà joué" (compte à rebours + stats), "pas de défi"
- [x] Écran "déjà joué" : ton score vs médiane, accordéon détail par morceau (pochette + lien Deezer)
- [x] `TextNormalizer` : suppression parenthèses/crochets avant comparaison (`(feat. X)`, `[Radio Edit]`)
- [x] Page d'accueil "welcome" avec bouton "Commencer à jouer" (session chargée en background — 0 latence au clic)
- [x] Préchargement audio non-bloquant (`AudioPlayerService.preloadAll` via `<link rel="preload" as="audio">`)
- [x] Bouton Stop pendant l'écoute pour passer directement à la saisie
- [x] Badge officiel "À écouter sur Deezer" (SVG Deezer branché) — `DeezerBadgeComponent`
- [x] Favicon SVG note Deezer (icône violette `#A238FF`)
- [x] Layout B — player haut + zone saisie toujours visible (sans clignotement)
- [x] Barre de progression live + chrono (`requestAnimationFrame` dans `AudioPlayerService`)
- [x] Champ unique artiste+titre avec autocomplete Deezer (proxy `GET /api/deezer/search`, debounce 300ms)
- [x] `DeezerSearchService` + `Features/Deezer/SearchEndpoint` (proxy public, contourne CORS)
- [x] `chosenDuration` en signal dans `BlindRoundComponent` (nécessaire pour `computed()` réactif)
- [x] Streak affiché sur le récap final et l'écran "déjà joué"
- [x] Replay preview après réponse — `AudioPlayerService.replayFull()`, relance depuis le début jusqu'à la fin naturelle du morceau
- [x] Synchronisation multi-onglets — `visibilitychange` dans `GameComponent`, relance `loadSession()` au retour au premier plan si partie non terminée
- [x] Partage score emoji Wordle-style (🟩🟨🟥 + durée + lien `/blindtest`) — copie presse-papier
- [x] Route `/blindtest` (alias de `/`) pour les liens de partage
- [x] Open Graph + Twitter Card dans `index.html` (partage WhatsApp / Signal)
- [x] `environment.appUrl` dans les fichiers d'environnement (prod/dev)

## ✅ Déploiement

- [x] Déploiement Northflank (front + back + PostgreSQL addon)
- [x] CI/CD auto sur push `main`
- [x] Secrets prod via Northflank (`AdminPassword`, connection string)

## 🚧 Mode entraînement (anciens défis)

> Rejouer un défi passé sans impacter le classement ni le streak. Score calculé côté serveur mais non persisté.

- [ ] **Backend** — nouveau paramètre `trainingMode: true` sur `StartSession` (ou endpoint dédié) : vérifie que le `DailyChallengeId` visé n'est pas le défi du jour, lève la contrainte d'unicité `(PlayerId, DailyChallengeId)`, n'écrit pas de `GameSession` en base (ou la marque `IsTraining=true`)
- [ ] **Backend** — `SubmitAnswer` en mode entraînement : calcule et renvoie le score normalement mais ne le cumule pas dans `GameSessions.TotalScore` / pas de ligne `GameSessionAnswers` persistée
- [ ] **Frontend** — page ou modale "Rejouer un ancien défi" accessible depuis l'écran "déjà joué" ou la home ; liste les derniers défis disponibles
- [ ] **Frontend** — indicateur visuel "Mode entraînement" pendant la partie (bandeau ou badge), récap final sans partage emoji ni mise à jour du streak
- [ ] **UX** — décider si les anciens défis sont accessibles sans limite (tout l'historique) ou fenêtre glissante (ex : 7 derniers jours)

## 🚧 Rétention & Engagement

> Inspiré des mécaniques Wordle / Heardle / NYT Connections. Priorité décroissante.

- [x] **Partage emoji spoiler-free** — grid résultats copiable (🟩/🟨/🟥 + durée par morceau, sans révéler les titres)
- [x] **Streak affiché** — nombre de jours consécutifs joués, affiché sur le récap final et l'écran "déjà joué"
- [ ] **Streak freeze** — 1 joker par semaine pour ne pas briser sa série (réduit le churn post-oubli)
- [ ] **Badges de difficulté** — récompense visuelle selon la durée moyenne écoutée (ex : "Légende" si moyenne ≤ 1s, "Explorateur" si ≤ 3s)
- [ ] **Meilleur score personnel** — stocker et afficher le record du joueur sur chaque morceau (écran "déjà joué")
- [ ] **Classement du jour anonyme** — top scores + médiane, sans pseudo ni leaderboard permanent

## 🚧 Tests

- [x] Tests d'intégration backend (Testcontainers, 69 tests) — `StartSession`, `SubmitAnswer`, `AbandonSession`, `Stats/Today`, `AdminStats` (KPIs jour, AvailableDates, fix 30j, Pending→Abandoned), `Auth/Me` (soft-delete), `SessionEdgeCases` (expiry paresseuse, streak, submit sur session abandonnée), `ChallengeGeneration`, `Admin/Tracks` (AddTrack, GetTracks, DeleteTrack, UpdateTrack), `Admin/Challenges` (GetChallenges, CreateChallenge, ResetToday)
- [ ] Tests front Karma/Jasmine (`AudioPlayerService` — dont `preloadAll`, `GameService`)
- [x] Tests E2E Playwright (27 scénarios : 12 jeu + 15 admin). Jeu : happy path, écran déjà joué, abandon mid-game, reprise, abandon depuis reprise, pas de défi, partage, scoring palier/mauvaise réponse/partiel. Admin : login erreur/succès/déconnexion, pool tableau+filtres texte/preview/statut, ajout morceau, suppression individuelle+annulation, actualisation morceau sans preview (modale pré-remplie), actions générer/déjà généré/reset, liste défis

## 🚧 Mobile

- [ ] Tests sur vrai appareil iOS (Safari + Chrome iOS)
- [ ] Tests sur vrai appareil Android (Chrome)
- [ ] Vérifier audio en mode silencieux iOS

## 🚧 Polish & Launch

- [ ] Cache Redis pour les preview URLs Deezer (`StackExchange.Redis`, TTL 24h, intercalé dans `StartSession/Handler.cs`)
- [ ] Smoke tests automatisés post-deploy
- [ ] Charte graphique / palette de couleurs (`@theme` Tailwind)
- [ ] Audit accessibilité WCAG 2.1 AA
- [ ] Vérifier politique d'usage API Deezer (CGU, rate limits)
- [ ] RGPD : anonymisation au soft-delete (pas juste `IsDeleted=true`)
- [ ] Mentions légales + CGU minimales

## Décisions définitives (ne pas réimplémenter)

- **Pas de Leaderboard permanent** — app volontairement simple, pas de pseudo, pas de classement inter-jours. Un classement anonyme du jour (top scores + médiane) reste envisageable
- **Pas d'Auth Register** — tout le monde joue en guest, pas de pseudo

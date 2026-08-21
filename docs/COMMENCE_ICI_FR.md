# InSeconds 🎵 — COMMENCE ICI

> **Point d'entrée** de la documentation projet. Pour le quick start utilisateur, voir [README.fr.md](../README.fr.md) à la racine. Pour les conventions code et pièges connus, voir [CLAUDE.md](../CLAUDE.md).

## Pitch

InSeconds est un **blind test musical quotidien**. Le joueur choisit combien de secondes il veut écouter (paliers : 0.5, 1, 1.5, 2, 3, 5, 10) avant de tenter artiste + titre. Moins il écoute, plus il marque. Même défi pour tout le monde, chaque jour, à minuit UTC. Mode guest disponible (joue sans s'inscrire).

## Stack actuelle

| Couche | Tech |
|--------|------|
| Backend | .NET 10, Wolverine (messaging), FluentValidation, EF Core 10 |
| Base de données | PostgreSQL (addon Northflank en prod, image Docker en dev) |
| Frontend | Angular 22 (standalone + signals), TypeScript, Tailwind CSS v4, SCSS |
| Musique | API Deezer (intégrée — recherche + preview + extraction `CoverHash`) |
| Infra dev | Docker Compose, `dotnet watch` (back), `ng serve` (front) |
| CI | GitHub Actions (build back + front + check migrations EF + tests unitaires + tests d'intégration Testcontainers + E2E Playwright), Dependabot |
| Déploiement | Northflank (front + back + PostgreSQL addon) |

## Architecture en deux mots

- **Backend** : Vertical Slice Architecture — chaque feature vit dans son propre dossier `Features/<Aggregate>/<UseCase>/` (Endpoint + Command/Query + Handler + Validator). Pas de couche service partagée fourre-tout. Wolverine route les messages aux handlers par convention.
- **Frontend** : Angular 22 standalone (pas de NgModules) avec signals pour l'état. Tailwind utility-first par-dessus SCSS pour les overrides locaux.
- **Modèle de données** : 7 tables (`Players`, `Tracks`, `DailyChallenges`, `DailyChallengeTracks`, `GameSessions`, `GameSessionAnswers`, `Settings`). Voir [`BACKEND_STRUCTURE_FR.md`](BACKEND_STRUCTURE_FR.md) pour le détail.
- **Gameplay anti-triche** : scoring serveur seulement, contrainte unique `(PlayerId, DailyChallengeId)` qui garantit 1 partie/jour/joueur, durée d'écoute = choix discret (pas une mesure → pas de tentative de manipulation client).

## Les autres documents de ce dossier

| Document | Contenu |
|----------|---------|
| [`TACHES.md`](TACHES.md) | Liste de toutes les tâches MVP — coche ce qui est fait, voir reste à faire |
| [`BACKEND_STRUCTURE_FR.md`](BACKEND_STRUCTURE_FR.md) | Référence d'architecture backend (vertical slice, modèle EF, Wolverine, services Common) |
| [`FRONTEND_STRUCTURE_FR.md`](FRONTEND_STRUCTURE_FR.md) | Référence d'architecture frontend (Angular 22, AudioPlayer durée-choisie, structure dossiers) |
| [`GAMEPLAY_RULES_FR.md`](GAMEPLAY_RULES_FR.md) | Règles de jeu consolidées : scoring, prolongation, anti-triche, streak — avec ce qui est réellement appliqué vs juste configuré |

## Quick start technique

```bash
# Cloner et démarrer le stack backend (DB + API hot-reload)
docker compose up -d

# Lancer le frontend
cd src/front/InSeconds.Client
npm install   # première fois seulement
npm start
```

Puis ouvrir `http://localhost:5173`. Voir le [README](../README.fr.md) pour les détails.

## État du projet

✅ **Fait** :

- Architecture vertical slice complète (Features/Domain/Infrastructure/Common)
- 7 entités du domaine + configurations EF + migrations appliquées (PostgreSQL)
- Setup Docker : conteneurs `inseconds.database` (PostgreSQL) + `inseconds.api` (hot-reload)
- Vertical slices `Sessions/StartSession` + `Sessions/SubmitAnswer` (scoring serveur + stats par morceau)
- Stats après chaque réponse : temps du joueur, moyenne des joueurs ayant trouvé, % d'échec
- Services Common : `TextNormalizer` (Levenshtein), `ScoreCalculator`, `SettingsService`
- `CookieAuthService` — résout/crée Player guest, cookie HttpOnly `SameSite=None` en prod
- **Création paresseuse du Player** (2026-08-21) — un simple chargement de page ne crée plus de ligne `Players` : seuls `POST /api/sessions` (démarrer une partie) et `GET /api/players/me` (admin) créent un Player à la demande ; `PlayerAuthMiddleware` se contente de résoudre un Player existant sans jamais en créer. Migration `PurgeUnplayedPlayers` (one-shot) pour nettoyer les Players existants sans aucune session.
- `playerAuthInterceptor` Angular — `withCredentials: true` sur toutes les requêtes joueur
- `DeezerClient` — recherche + preview + extraction `CoverHash`
- Settings via `IOptions<AppSettings>` chargé depuis la BD au boot (ADO.NET brut)
- `Track.CoverHash` + `AppSettings.CoverUrlTemplate` (URL reconstruite à la volée)
- Page admin (`/admin`) — login, pool (sous-onglets + indicateur preview + popup ajout avec lecteur), défis, stats dashboard, reset sessions
- Auth admin via Bearer token + `adminAuthInterceptor` Angular
- `BackgroundService` génération défi quotidien automatique (à minuit UTC, retry toutes les 10 min en cas d'échec) — filtre sur `Track.HasPreview` en DB, Fisher-Yates, transaction ; planification via `DailySchedule.NextUtcHour` + `DelayUntilAsync` (attente sur cible d'horloge murale : un réveil anticipé de `Task.Delay` ne saute plus de jour, cf. piège 19)
- **Génération paresseuse dans `StartSession`** — si le défi du jour manque (job de minuit raté), le premier joueur le régénère à la volée (sélection déterministe seed = `DayNumber`, course gérée par la contrainte unique sur `Date`) ; le 503 « pas de défi » ne subsiste que si le pool est insuffisant
- **Clés Data Protection persistées en base** (`PersistKeysToDbContext`, table `DataProtectionKeys`) — les cookies joueurs survivent aux redémarrages/redéploiements Northflank (piège 17 résolu)
- `BackgroundService` refresh preview (à 23h UTC, avant la génération de minuit) — vérifie Deezer pour tous les tracks disponibles par lots (rate-limit safe), met à jour `Track.HasPreview` uniquement sur réponse Deezer déterminée (jamais sur un échec quota/panne) ; relançable à la demande via `POST /api/admin/refresh-previews` (bouton « 🔄 Re-vérifier les previews » dans l'onglet Actions admin)
- Frontend complet (Angular 22 + Tailwind v4 + SCSS) — UI jeu jouable
- NSwag : `ApiClient` généré depuis l'OpenAPI back, `api.generated.ts` commité, types synchronisés automatiquement
- Pages d'erreur : 404, "déjà joué" (compte à rebours + stats comparatives), "pas de défi"
- Récap final : lien Deezer par morceau + streak + bouton partage emoji Wordle-style
- `GET /api/stats/today` : score joueur, médiane joueurs, détail par morceau (pochette + lien Deezer)
- Écran "déjà joué" : ton score vs médiane, streak, accordéon détail par morceau
- `ListenedDurationSeconds` et `TotalDurationSeconds` en `decimal` (paliers décimaux jusqu'à 0.5s)
- CI GitHub Actions (build back/front + check migrations) + CI/CD auto sur push `main`
- Déploiement Northflank (front + back + PostgreSQL)
- `TextNormalizer` : suppression parenthèses/crochets avant comparaison — `(feat. X)`, `[Radio Edit]`
- Page d'accueil "welcome" — session chargée en background, bouton "Commencer à jouer" sans latence
- Préchargement audio non-bloquant (`<link rel="preload" as="audio">`)
- Bouton Stop pendant l'écoute pour accéder directement à la saisie
- Layout B — player haut (toujours visible) + zone saisie toujours présente (pas de clignotement)
- Barre de progression live + chrono centré (`requestAnimationFrame`)
- Champ unique artiste+titre avec autocomplete Deezer (proxy `/api/deezer/search`, debounce 300ms) — suggestions nettoyées (parenthèses/crochets retirés, doublons fusionnés côté back, `SearchEndpoint.CleanAndDeduplicate`) et navigable au clavier (↓/↑/Entrée/Échap, `BlindRoundComponent.onSearchKeydown`)
- Badge officiel "À écouter sur Deezer" (`DeezerBadgeComponent`) + favicon SVG note Deezer
- Route `/blindtest` + balises Open Graph/Twitter Card pour partage WhatsApp/Signal
- Streak joueur (`Player.CurrentStreak` + `Player.LastPlayedDate`) mis à jour à la complétion dans `SubmitAnswer/Handler.cs`, basée sur `DailyChallenge.Date` (terminer le défi de la veille après minuit UTC ne casse plus la streak)
- Gestion morceaux sans preview : skip 0s accepté par le validateur, bouton "Passer" dans le jeu
- Replay preview après soumission de réponse (`AudioPlayerService.replayFull()`)
- Synchronisation multi-onglets via `visibilitychange` — si la partie est terminée dans un autre onglet, le front bascule en `already_played` au retour au premier plan
- **Anti-cheat durée min écoutée** : `GameSession.CurrentTrackId` + `GameSession.CurrentTrackMinListenedSeconds` (migration `AddSessionAntiCheat`). Slice `Sessions/UpdateListening` (`PATCH /api/sessions/{id}/listening`) — enregistre la durée max par track à chaque arrêt du timer. À la reprise, les paliers déjà écoutés sont masqués dans `BlindRoundComponent` (computed `durations()` filtre sur `minListenedSeconds`).
- Pool admin redesigné en tableau paginé (15 lignes/page) avec filtres combinables (texte, statut, preview), onglet "Actions" dédié, modale "↻ Actualiser" pré-remplie pour morceaux sans preview — indicateur preview lu depuis `Track.HasPreview` en DB (stable, plus d'appel Deezer temps réel)
- Dashboard admin : KPI tiles par jour, sélecteur de jour ← →, barres 30j cliquables avec jours vides à zéro ; stats par défi + historique regroupés dans l'onglet Défis (navigateur de mois unique) ; autonomie du pool (« X jours de défis restants ») affichée dans l'onglet Pool ; ordre des onglets : Dashboard, Défis, Pool, Actions
- Tests E2E Playwright (55 scénarios : 34 jeu + 21 admin, CI GitHub Actions)
- Tests d'intégration backend (`InSeconds.Api.IntegrationTests`) — Testcontainers.PostgreSql + `WebApplicationFactory<Program>` + Respawn, 104 tests couvrant StartSession, SubmitAnswer, AbandonSession, Stats, AdminStats (dont la liste des joueurs par défi), Players (`GET /api/players/me`), PlayerSoftDelete, SessionEdgeCases (dont UpdateListening et streak sur la date du défi), ChallengeGeneration, LazyChallengeGeneration (régénération à la volée + 503 si pool insuffisant), Admin/Tracks, Admin/Challenges, Admin/RefreshPreviews, Admin/Settings, DeezerSearch (nettoyage + déduplication autocomplete), HealthCheck (dont date de build), job CI dédié `integration-tests`
- **i18n FR/EN** — ngx-translate v18, `LanguageService`, fichiers `public/i18n/{fr,en}.json` ; sélecteur de langue dans le footer (globe monochrome + code FR/EN, persist localStorage)
- **Page confidentialité** — `PrivacyComponent` (`features/privacy/`), routes `/privacy` + `/confidentialite`, lien dans le footer
- **Refacto frontend** — `game.component` découpé en header + footer + 5 screens + `GameFacadeService` + `DeezerAutocompleteService` (`features/game/services/`) ; `admin.component` en shell + 6 services (`AdminHttpService`, `AdminStateService`, `AdminApiService`, `AdminStatsService`, `AdminPoolService`, `AdminActionsService`) + 7 sous-composants ; palette CSS centralisée en variables `:root` ; `ShareButtonComponent` réutilisable
- **Tests unitaires frontend** — 142 tests Karma/Jasmine (`GameService`, `SettingsService`, `LanguageService`, `GameFooterComponent`, `AdminHttpService`, `AdminStatsService`, `AdminPoolService` avec l'autonomie du pool, `BlindRoundComponent` avec la navigation clavier de l'autocomplete, `ClipboardService`, `PlayerIdentityService`, `BrowserIdComponent`, `ChallengesTabComponent` avec les chips d'identité joueur) ; job CI `unit-tests-front` (`ChromeHeadless`)
- **Indicateur joueurs par défi + ID navigateur en admin** (2026-08-15) — `GET /api/players/me` expose le `PlayerId` du cookie courant (illisible côté front sinon : cookie `HttpOnly` + chiffré) ; `GetAdminStats` renvoie la liste des joueurs par défi (`ChallengeStatsDto.Players`) ; `ChallengesTabComponent` affiche un chip ID court par joueur (copie au clic, surbrillance auto « toi ») ; `BrowserIdComponent` (partagé) affiche l'ID + bouton copier sur l'écran de login et dans le shell admin ; `ClipboardService` mutualisé entre le partage de score (jeu) et ces deux nouveaux composants
- **Headers `Cache-Control` nginx** (2026-08-15) — `nginx.conf` (prod) pose `immutable, max-age=31536000` sur les bundles JS/CSS hashés et `no-cache` (revalidation systématique) sur `i18n/*.json`/`index.html`/routes SPA — corrige un incident de cache navigateur affichant des clés de traduction en brut après déploiement (piège 20 du [`CLAUDE.md`](../CLAUDE.md)) ; premier smoke test post-déploiement du projet, job CI dédié `nginx-headers` qui construit et sert réellement l'image Docker de prod
- **Nettoyage des titres affichés au-delà de l'autocomplete** (2026-08-17) — `TextNormalizationHelpers.CleanDisplayTitle` (extrait de `SearchEndpoint.CleanTitle`) retire les parenthèses/crochets de tout titre de morceau révélé après coup : réponse par morceau + récap final (`SubmitAnswer`), reprise de partie (`StartSession`), écran "déjà joué" (`Stats/Today`), onglet Défis admin — sections Stats par défi (`GetAdminStats`) et Historique (`GetChallenges`, corrigé après coup le même jour). `Track.Title` en base et la recherche admin restent bruts (nécessaires pour le re-sync Deezer)

- **Cache Deezer** — `CachedDeezerClient` (`IMemoryCache`) : preview URLs (TTL borné par l'expiration de la signature CDN, sinon 403 à la lecture) + recherches autocomplete (1h)

🚧 **À faire** : élargir les smoke tests post-deploy (un seul couvert pour l'instant : headers de cache nginx), tests mobiles, polish, éventuel passage du cache Deezer sur Redis (multi-instances). Voir [`TACHES.md`](TACHES.md).

## Specs gameplay clés (rappel rapide)

> Détail complet (barème exact, ce qui est réellement appliqué vs juste configuré) : [`GAMEPLAY_RULES_FR.md`](GAMEPLAY_RULES_FR.md).

- **N morceaux par jour** (configurable via `TracksPerChallenge` en BD, défaut 3), même set pour tout le monde
- **Paliers d'écoute** : 0.5, 1, 1.5, 2, 3, 5, 10 secondes (configurable via la table `Settings`)
- **Prolongations libres** (« écouter plus »), sans limite de nombre, jusqu'au dernier palier — scoring toujours basé sur le palier final, aucun malus
- **Timer de saisie** : 20s après la fin de la lecture pour saisir artiste + titre (configurable)
- **Scoring partiel** : `ArtistCorrect` et `TitleCorrect` séparés
- **Anti-triche** : scoring 100% serveur, contrainte BD `UNIQUE (PlayerId, DailyChallengeId)`, durée stockée = palier choisi (validée côté serveur contre la liste autorisée)
- **Mobile-first** : `playsinline` audio, `100dvh`, inputs ≥ 16px, `touch-action: manipulation`

## Mode guest

Le joueur peut jouer le défi du jour **sans créer de compte** :

- Un `Player { IsGuest=true, Pseudo=null }` est créé au moment où le joueur démarre réellement une partie (`POST /api/sessions`) — **pas** au simple chargement de la page (cf. "Création paresseuse du Player" ci-dessus)
- Un cookie HTTP-only signé porte le `Player.AuthToken` pour le reconnaître
- Pas de leaderboard (décision délibérée — app volontairement simple, stats globales suffisent)
- Cleanup périodique des guests inactifs > 30 jours (à implémenter — la migration `PurgeUnplayedPlayers` n'est qu'un nettoyage ponctuel des Players jamais joués, pas une purge récurrente)

---

**Pour démarrer une nouvelle feature, lire [CLAUDE.md](../CLAUDE.md) puis [`TACHES.md`](TACHES.md).**

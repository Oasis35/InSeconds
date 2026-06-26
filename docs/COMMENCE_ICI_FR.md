# InSeconds 🎵 — COMMENCE ICI

> **Point d'entrée** de la documentation projet. Pour le quick start utilisateur, voir [README.fr.md](../README.fr.md) à la racine. Pour les conventions code et pièges connus, voir [CLAUDE.md](../CLAUDE.md).

## Pitch

InSeconds est un **blind test musical quotidien**. Le joueur choisit combien de secondes il veut écouter (paliers : 0.5, 1, 1.5, 2, 3, 5, 10) avant de tenter artiste + titre. Moins il écoute, plus il marque. Même défi pour tout le monde, chaque jour, à minuit UTC. Mode guest disponible (joue sans s'inscrire).

## Stack actuelle

| Couche | Tech |
|--------|------|
| Backend | .NET 10, Wolverine (messaging), FluentValidation, EF Core 10 |
| Base de données | PostgreSQL (addon Northflank en prod, image Docker en dev) |
| Frontend | Angular 20 (standalone + signals), TypeScript, Tailwind CSS v4, SCSS |
| Musique | API Deezer (intégrée — recherche + preview + extraction `CoverHash`) |
| Infra dev | Docker Compose, `dotnet watch` (back), `ng serve` (front) |
| CI | GitHub Actions (build back + front + check migrations EF + tests unitaires + tests d'intégration Testcontainers + E2E Playwright), Dependabot |
| Déploiement | Northflank (front + back + PostgreSQL addon) |

## Architecture en deux mots

- **Backend** : Vertical Slice Architecture — chaque feature vit dans son propre dossier `Features/<Aggregate>/<UseCase>/` (Endpoint + Command/Query + Handler + Validator). Pas de couche service partagée fourre-tout. Wolverine route les messages aux handlers par convention.
- **Frontend** : Angular 20 standalone (pas de NgModules) avec signals pour l'état. Tailwind utility-first par-dessus SCSS pour les overrides locaux.
- **Modèle de données** : 7 tables (`Players`, `Tracks`, `DailyChallenges`, `DailyChallengeTracks`, `GameSessions`, `GameSessionAnswers`, `Settings`). Voir [`BACKEND_STRUCTURE_FR.md`](BACKEND_STRUCTURE_FR.md) pour le détail.
- **Gameplay anti-triche** : scoring serveur seulement, contrainte unique `(PlayerId, DailyChallengeId)` qui garantit 1 partie/jour/joueur, durée d'écoute = choix discret (pas une mesure → pas de tentative de manipulation client).

## Les autres documents de ce dossier

| Document | Contenu |
|----------|---------|
| [`TACHES.md`](TACHES.md) | Liste de toutes les tâches MVP — coche ce qui est fait, voir reste à faire |
| [`BACKEND_STRUCTURE_FR.md`](BACKEND_STRUCTURE_FR.md) | Référence d'architecture backend (vertical slice, modèle EF, Wolverine, services Common) |
| [`FRONTEND_STRUCTURE_FR.md`](FRONTEND_STRUCTURE_FR.md) | Référence d'architecture frontend (Angular 20, AudioPlayer durée-choisie, structure dossiers) |

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
- `playerAuthInterceptor` Angular — `withCredentials: true` sur toutes les requêtes joueur
- `DeezerClient` — recherche + preview + extraction `CoverHash`
- Settings via `IOptions<AppSettings>` chargé depuis la BD au boot (ADO.NET brut)
- `Track.CoverHash` + `AppSettings.CoverUrlTemplate` (URL reconstruite à la volée)
- Page admin (`/admin`) — login, pool (sous-onglets + indicateur preview + popup ajout avec lecteur), défis, stats dashboard, reset sessions
- Auth admin via Bearer token + `adminAuthInterceptor` Angular
- `BackgroundService` génération défi quotidien automatique (à 3h UTC) — filtre sur `Track.HasPreview` en DB, Fisher-Yates, transaction
- `BackgroundService` refresh preview (à 2h UTC) — vérifie Deezer pour tous les tracks disponibles, met à jour `Track.HasPreview`
- Frontend complet (Angular 20 + Tailwind v4 + SCSS) — UI jeu jouable
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
- Champ unique artiste+titre avec autocomplete Deezer (proxy `/api/deezer/search`, debounce 300ms)
- Badge officiel "À écouter sur Deezer" (`DeezerBadgeComponent`) + favicon SVG note Deezer
- Route `/blindtest` + balises Open Graph/Twitter Card pour partage WhatsApp/Signal
- Streak joueur (`Player.CurrentStreak` + `Player.LastPlayedDate`) mis à jour au `StartSession`
- Gestion morceaux sans preview : skip 0s accepté par le validateur, bouton "Passer" dans le jeu
- Pool admin redesigné en tableau paginé (15 lignes/page) avec filtres combinables (texte, statut, preview), onglet "Actions" dédié, modale "↻ Actualiser" pré-remplie pour morceaux sans preview — indicateur preview lu depuis `Track.HasPreview` en DB (stable, plus d'appel Deezer temps réel)
- Dashboard admin : KPI tiles par jour, sélecteur de jour ← →, barres 30j cliquables avec jours vides à zéro
- Tests E2E Playwright (27 scénarios : 12 jeu + 15 admin, CI GitHub Actions)
- Tests d'intégration backend (`InSeconds.Api.IntegrationTests`) — Testcontainers.PostgreSql + `WebApplicationFactory<Program>` + Respawn, 69 tests couvrant StartSession, SubmitAnswer, AbandonSession, Stats, AdminStats, SessionEdgeCases, ChallengeGeneration, Admin/Tracks, Admin/Challenges, job CI dédié `integration-tests`

🚧 **À faire** : smoke tests post-deploy, tests mobiles, polish, cache Redis previews Deezer. Voir [`TACHES.md`](TACHES.md).

## Specs gameplay clés (rappel rapide)

- **N morceaux par jour** (configurable via `TracksPerChallenge` en BD, défaut 3), même set pour tout le monde
- **Paliers d'écoute** : 0.5, 1, 1.5, 2, 3, 5, 10 secondes (configurable via la table `Settings`)
- **1 prolongation** autorisée par réponse (passe au palier supérieur, scoring sur le palier final)
- **Timer de saisie** : 20s après la fin de la lecture pour saisir artiste + titre (configurable)
- **Scoring partiel** : `ArtistCorrect` et `TitleCorrect` séparés
- **Anti-triche** : scoring 100% serveur, contrainte BD `UNIQUE (PlayerId, DailyChallengeId)`, durée stockée = palier choisi (validée côté serveur contre la liste autorisée)
- **Mobile-first** : `playsinline` audio, `100dvh`, inputs ≥ 16px, `touch-action: manipulation`

## Mode guest

Le joueur peut jouer le défi du jour **sans créer de compte** :

- Un `Player { IsGuest=true, Pseudo=null }` est créé automatiquement au 1ᵉʳ appel
- Un cookie HTTP-only signé porte le `Player.AuthToken` pour le reconnaître
- Pas de leaderboard (décision délibérée — app volontairement simple, stats globales suffisent)
- Cleanup périodique des guests inactifs > 30 jours (à implémenter)

---

**Pour démarrer une nouvelle feature, lire [CLAUDE.md](../CLAUDE.md) puis [`TACHES.md`](TACHES.md).**

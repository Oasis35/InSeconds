[🇬🇧 Read in English](README.md)

# InSeconds 🎵

> Blind test musical quotidien. Écoute le moins longtemps possible, devine artiste + titre. Moins de temps = plus de points. Même défi pour tout le monde, chaque jour.

## Comment ça marche

- Chaque jour à minuit UTC, un nouveau set de morceaux est sélectionné automatiquement (uniquement des morceaux avec une preview Deezer active) ; si la génération de minuit a raté, le défi est régénéré automatiquement à l'arrivée du premier joueur (sélection déterministe : même défi pour tout le monde)
- La disponibilité des previews est re-vérifiée chaque nuit auprès de Deezer (appels par lots, respectueux du rate-limit) ; les admins peuvent aussi relancer la vérification à la demande depuis la page admin
- Choisis combien de secondes écouter (0.5, 1, 1.5, 2, 3, 5, 10) avant de tenter artiste + titre
- Une prolongation autorisée par morceau (palier supérieur, avec malus de score)
- Le scoring est entièrement côté serveur — impossible de tricher côté client
- Mode guest : joue sans créer de compte, hors classement
- Streak quotidien affiché sur l'écran récap final
- Partage de score en format emoji Wordle (copie dans le presse-papier)
- Disponible en français et en anglais — détecté automatiquement depuis le navigateur, changeable à tout moment depuis le pied de page (choix sauvegardé en localStorage)
- Page politique de confidentialité sur `/confidentialite` (alias `/privacy`)

## Démarrage rapide

### Prérequis

- Docker Desktop (pour les conteneurs base de données + API)
- Node.js 22+ et npm
- Angular CLI 22+ (`npm install -g @angular/cli`)
- .NET 10 SDK (uniquement si tu veux lancer l'API hors Docker)

### Lancer le backend

```bash
docker compose up -d
```

Ça démarre :

- `inseconds.database` — PostgreSQL sur `localhost:5432`
- `inseconds.api` — API .NET 10 sur `http://localhost:5171` avec hot-reload `dotnet watch`

Les migrations EF Core sont appliquées automatiquement au démarrage.

### Lancer le frontend

```bash
cd src/front/InSeconds.Client
npm install   # uniquement la première fois
npm start
```

Ouvre `http://localhost:5173`.

### URLs utiles

| URL | Usage |
|-----|-------|
| `http://localhost:5173` | Frontend (serveur de dev Angular) |
| `http://localhost:5171/health` | Liveness de l'API (l'app répond aux requêtes) — renvoie aussi la date de build (`build`) pour identifier la version déployée |
| `http://localhost:5171/health/ready` | Readiness de l'API (base de données joignable) — sondé par Northflank |
| `http://localhost:5171/openapi/v1.json` | Spec OpenAPI (utilisée par NSwag pour la génération du client TS) |

## Stack

| Couche | Tech |
|--------|------|
| Backend | .NET 10, Wolverine (messaging), FluentValidation, EF Core 10 |
| Base de données | PostgreSQL (Docker en dev, addon Northflank en prod) |
| Frontend | Angular 22 (standalone + signals), TypeScript, Tailwind CSS v4, SCSS |
| Musique | API Deezer (recherche, previews 30s, pochettes) |
| Infra dev | Docker Compose, `dotnet watch` (backend), `ng serve` (frontend) |
| Déploiement | Northflank (front + back + PostgreSQL) |

## Structure du dépôt

```
InSeconds/
├── docs/                      # Notes d'architecture (FR)
├── src/
│   ├── back/
│   │   ├── InSeconds.slnx              # Solution .NET (format .slnx)
│   │   ├── InSeconds.Api/              # Web API (vertical slice)
│   │   ├── InSeconds.Api.UnitTests/    # Tests unitaires xUnit (pas de BD)
│   │   └── InSeconds.Api.IntegrationTests/ # Tests d'intégration xUnit (Testcontainers)
│   └── front/
│       └── InSeconds.Client/  # Application Angular
├── docker-compose.yml
└── README.md / README.fr.md
```

## Intégration continue

Workflow GitHub Actions sur chaque push et chaque PR vers `main` :

- **Backend** — build Release + `dotnet ef migrations has-pending-model-changes`
- **Tests unitaires** — `dotnet test` sur `InSeconds.Api.UnitTests` (xUnit, pas de BD requise)
- **Frontend** — `npm ci` + build production
- **Tests unitaires frontend** — `ng test --watch=false --browsers=ChromeHeadless` (Karma + Jasmine, 101 tests)
- **Tests d'intégration** — `dotnet test` sur `InSeconds.Api.IntegrationTests` (Testcontainers crée un conteneur PostgreSQL réel, pas de YAML supplémentaire)
- **E2E** — tests Playwright (Chromium) contre un vrai backend en mode `Testing` avec un service PostgreSQL — s'exécute après tous les jobs précédents

Les runs obsolètes sont annulés automatiquement.

## Tests

### Tests unitaires (backend)

```bash
cd src/back
dotnet test InSeconds.Api.UnitTests
```

Couvre `ScoreCalculator`, `TextNormalizer`, `SettingsService` et autres services Common. Pas de base de données nécessaire (logique pure).

### Tests unitaires (frontend)

```bash
cd src/front/InSeconds.Client
npx ng test --watch=false --browsers=ChromeHeadless
```

**101 tests** (Karma + Jasmine) couvrant `App`, `GameService`, `SettingsService`, `LanguageService`, `GameFooterComponent` (toggle langue), `AdminHttpService`, `AdminStatsService`, `AdminPoolService` (autonomie du pool). Utilise `HttpTestingController` — pas de vraies requêtes HTTP.

### Tests d'intégration (backend)

```bash
cd src/back
dotnet test InSeconds.Api.IntegrationTests
```

Nécessite Docker (Testcontainers démarre un vrai conteneur PostgreSQL). **84 tests** couvrant `StartSession`, `SubmitAnswer`, `AbandonSession`, `Stats/Today`, `AdminStats`, `PlayerSoftDelete`, `SessionEdgeCases` (expiry paresseuse, streak — dont défi de la veille terminé après minuit UTC, submit sur session abandonnée, UpdateListening anti-triche), `ChallengeGeneration`, `LazyChallengeGeneration` (régénération du défi à la volée), `Admin/Tracks`, `Admin/Challenges`, `Admin/RefreshPreviews`, `HealthCheck`.

### Tests E2E (Playwright)

```bash
# Une commande — reset Docker, démarre le backend en mode Testing, lance tous les tests
powershell -File scripts/run-e2e.ps1
```

Ou si le backend tourne déjà en mode Testing :

```bash
cd src/front/InSeconds.Client
npm run e2e        # headless
npm run e2e:ui     # UI interactive Playwright
```

**43 tests** — 28 tests jeu (happy path, déjà joué, abandon, reprise, sync multi-onglets, pas de défi + renaissance automatique du défi supprimé, partage + échec de copie presse-papier, scoring, paliers bloqués à la reprise anti-triche, confirmation de sortie, bouton ✕ d'effacement, overlay "Service indisponible", toggle langue + page confidentialité) + 15 tests admin (login, tableau pool avec filtres, ajout/suppression/actualisation morceau, générer défi, reset sessions, liste défis).

Le backend tourne en `ASPNETCORE_ENVIRONMENT=Testing` qui active :
- `FakeDeezerHandler` — retourne un `test-audio.mp3` local ; les IDs >= 9_000_000_000 retournent une preview vide (5 morceaux seed : The Beatles, Pink Floyd, Bob Dylan, Led Zeppelin, Fleetwood Mac) pour tester le flux "↻ Actualiser"
- `PurgeSeedData` + `SeedData` à chaque démarrage (55 morceaux au total)
- Endpoint `DELETE /api/e2e/reset` pour l'isolation entre tests

## Documentation

- [`docs/COMMENCE_ICI_FR.md`](docs/COMMENCE_ICI_FR.md) — point d'entrée et état du projet
- [`docs/TACHES.md`](docs/TACHES.md) — liste des tâches
- [`docs/BACKEND_STRUCTURE_FR.md`](docs/BACKEND_STRUCTURE_FR.md) — référence d'architecture backend
- [`docs/FRONTEND_STRUCTURE_FR.md`](docs/FRONTEND_STRUCTURE_FR.md) — référence d'architecture frontend
- [`docs/GAMEPLAY_RULES_FR.md`](docs/GAMEPLAY_RULES_FR.md) — règles de jeu (scoring, prolongation, anti-triche, streak) — ce qui est réellement appliqué vs juste configuré
- [`CLAUDE.md`](CLAUDE.md) — conventions et pièges du repo (à lire avant de contribuer)

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE) — libre d'utilisation, de modification et de distribution pour tout usage non-commercial (personnel, éducatif, hobby, recherche). Un usage commercial nécessite un accord séparé avec l'auteur.

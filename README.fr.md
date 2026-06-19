[🇬🇧 Read in English](README.md)

# InSeconds 🎵

> Blind test musical quotidien. Écoute le moins longtemps possible, devine artiste + titre. Moins de temps = plus de points. Même défi pour tout le monde, chaque jour.

## Comment ça marche

- Chaque jour à 3h UTC, un nouveau set de morceaux est sélectionné automatiquement (uniquement des morceaux avec une preview Deezer active)
- Choisis combien de secondes écouter (0.5, 1, 1.5, 2, 3, 5, 10) avant de tenter artiste + titre
- Une prolongation autorisée par morceau (palier supérieur, avec malus de score)
- Le scoring est entièrement côté serveur — impossible de tricher côté client
- Mode guest : joue sans créer de compte, hors classement
- Streak quotidien affiché sur l'écran récap final
- Partage de score en format emoji Wordle (copie dans le presse-papier)

## Démarrage rapide

### Prérequis

- Docker Desktop (pour les conteneurs base de données + API)
- Node.js 22+ et npm
- Angular CLI 20+ (`npm install -g @angular/cli`)
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
| `http://localhost:5171/health` | Healthcheck de l'API |
| `http://localhost:5171/openapi/v1.json` | Spec OpenAPI (utilisée par NSwag pour la génération du client TS) |

## Stack

| Couche | Tech |
|--------|------|
| Backend | .NET 10, Wolverine (messaging), FluentValidation, EF Core 10 |
| Base de données | PostgreSQL (Docker en dev, addon Northflank en prod) |
| Frontend | Angular 20 (standalone + signals), TypeScript, Tailwind CSS v4, SCSS |
| Musique | API Deezer (recherche, previews 30s, pochettes) |
| Infra dev | Docker Compose, `dotnet watch` (backend), `ng serve` (frontend) |
| Déploiement | Northflank (front + back + PostgreSQL) |

## Structure du dépôt

```
InSeconds/
├── docs/                      # Notes d'architecture (FR)
├── src/
│   ├── back/
│   │   ├── InSeconds.slnx     # Solution .NET (format .slnx)
│   │   └── InSeconds.Api/     # Web API (vertical slice)
│   └── front/
│       └── InSeconds.Client/  # Application Angular
├── docker-compose.yml
└── README.md / README.fr.md
```

## Intégration continue

Workflow GitHub Actions sur chaque push et chaque PR vers `main` :

- **Backend** — build Release + `dotnet ef migrations has-pending-model-changes`
- **Tests unitaires** — `dotnet test` (xUnit, pas de BD requise)
- **Frontend** — `npm ci` + build production
- **E2E** — tests Playwright (Chromium) contre un vrai backend en mode `Testing` avec un service PostgreSQL — s'exécute après les trois jobs précédents

Les runs obsolètes sont annulés automatiquement.

## Tests

### Tests unitaires (backend)

```bash
cd src/back
dotnet test InSeconds.slnx
```

Couvre `ScoreCalculator`, `TextNormalizer`, `SettingsService` et autres services Common. Pas de base de données nécessaire (logique pure).

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

9 tests couvrent : happy path complet (3 morceaux), écran "déjà joué" (409), écran "pas de défi" (503), bouton partage (presse-papier), et scoring (palier court > long, mauvaise réponse = 0, scoring partiel artiste seul = 50 %).

Le backend tourne en `ASPNETCORE_ENVIRONMENT=Testing` qui active :
- `FakeDeezerHandler` — retourne un `test-audio.mp3` local au lieu d'appeler Deezer
- `PurgeSeedData` + `SeedDevelopmentData` à chaque démarrage
- Endpoint `DELETE /api/e2e/reset` pour l'isolation entre tests

## Documentation

- [`docs/COMMENCE_ICI_FR.md`](docs/COMMENCE_ICI_FR.md) — point d'entrée et état du projet
- [`docs/TACHES.md`](docs/TACHES.md) — liste des tâches
- [`docs/BACKEND_STRUCTURE_FR.md`](docs/BACKEND_STRUCTURE_FR.md) — référence d'architecture backend
- [`docs/FRONTEND_STRUCTURE_FR.md`](docs/FRONTEND_STRUCTURE_FR.md) — référence d'architecture frontend
- [`CLAUDE.md`](CLAUDE.md) — conventions et pièges du repo (à lire avant de contribuer)

## Licence

Projet privé, pas encore de licence publique.

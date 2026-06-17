[🇫🇷 Lire en français](README.fr.md)

# InSeconds 🎵

> Daily music blind test. Listen as briefly as you can, guess artist + title. Less time = more points. Same challenge for everyone, every day.

## How it works

- Each day at 3 AM UTC, a new set of tracks is automatically selected (only tracks with an active Deezer preview)
- Choose how many seconds to listen (0.5, 1, 1.5, 2, 3, 5, 10) before attempting artist + title
- One extension allowed per track (next duration tier, with a score penalty)
- Scoring is entirely server-side — no client-side manipulation possible
- Guest mode: play without signing up, no leaderboard
- Daily streak tracked and displayed on the final recap screen
- Share your score in Wordle-style emoji format via the clipboard

## Quick start

### Prerequisites

- Docker Desktop (for the database + API containers)
- Node.js 22+ and npm
- Angular CLI 20+ (`npm install -g @angular/cli`)
- .NET 10 SDK (only if you want to run the API outside Docker)

### Run the backend

```bash
docker compose up -d
```

This starts:

- `inseconds.database` — PostgreSQL on `localhost:5432`
- `inseconds.api` — .NET 10 API on `http://localhost:5171` with `dotnet watch` hot-reload

EF Core migrations are applied automatically on startup.

### Run the frontend

```bash
cd src/front/InSeconds.Client
npm install   # first time only
npm start
```

Open `http://localhost:5173`.

### Useful URLs

| URL | Purpose |
|-----|---------|
| `http://localhost:5173` | Frontend (Angular dev server) |
| `http://localhost:5171/health` | API health check |
| `http://localhost:5171/openapi/v1.json` | OpenAPI spec (used by NSwag for client generation) |

## Stack

| Layer | Tech |
|-------|------|
| Backend | .NET 10, Wolverine messaging, FluentValidation, EF Core 10 |
| Database | PostgreSQL (Docker in dev, Northflank addon in prod) |
| Frontend | Angular 20 (standalone + signals), TypeScript, Tailwind CSS v4, SCSS |
| Music | Deezer API (search, 30s previews, cover art) |
| Infra dev | Docker Compose, `dotnet watch` (backend), `ng serve` (frontend) |
| Deployment | Northflank (front + back + PostgreSQL) |

## Repository structure

```
InSeconds/
├── docs/                      # Architecture notes (FR)
├── src/
│   ├── back/
│   │   ├── InSeconds.slnx     # .NET solution (.slnx format)
│   │   └── InSeconds.Api/     # Web API (vertical slice architecture)
│   └── front/
│       └── InSeconds.Client/  # Angular app
├── docker-compose.yml
└── README.md / README.fr.md
```

## Continuous integration

GitHub Actions workflow on every push and every PR to `main`:

- **Backend** — build in Release + `dotnet ef migrations has-pending-model-changes`
- **Frontend** — `npm ci` + production build

Stale runs are cancelled automatically. No Docker/DB in CI yet — integration tests will use Testcontainers when added.

## Documentation

- [`docs/COMMENCE_ICI_FR.md`](docs/COMMENCE_ICI_FR.md) — project entry point and state overview
- [`docs/TACHES.md`](docs/TACHES.md) — task list
- [`docs/BACKEND_STRUCTURE_FR.md`](docs/BACKEND_STRUCTURE_FR.md) — backend architecture reference
- [`docs/FRONTEND_STRUCTURE_FR.md`](docs/FRONTEND_STRUCTURE_FR.md) — frontend architecture reference
- [`CLAUDE.md`](CLAUDE.md) — repo conventions and gotchas (read this before contributing)

## License

Private project, no public license yet.

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
- **Unit tests** — `dotnet test` (xUnit, no DB required)
- **Frontend** — `npm ci` + production build
- **E2E** — Playwright tests (Chromium) against a real backend in `Testing` mode with a PostgreSQL service — runs after the three jobs above pass

Stale runs are cancelled automatically.

## Testing

### Unit tests (backend)

```bash
cd src/back
dotnet test InSeconds.slnx
```

Covers `ScoreCalculator`, `TextNormalizer`, `SettingsService` and other Common services. No database required (pure logic).

### E2E tests (Playwright)

```bash
# One command — resets Docker, starts backend in Testing mode, runs all tests
powershell -File scripts/run-e2e.ps1
```

Or if the backend is already running in Testing mode:

```bash
cd src/front/InSeconds.Client
npm run e2e        # headless
npm run e2e:ui     # interactive Playwright UI
```

9 tests cover: full happy path (3 tracks), already-played screen (409), no-challenge screen (503), share button (clipboard), and scoring (short duration > long, wrong answer = 0, partial artist-only = 50%).

The backend runs in `ASPNETCORE_ENVIRONMENT=Testing` which activates:
- `FakeDeezerHandler` — returns a local `test-audio.mp3` instead of calling Deezer
- `PurgeSeedData` + `SeedDevelopmentData` on every startup
- `DELETE /api/e2e/reset` endpoint for test isolation

## Documentation

- [`docs/COMMENCE_ICI_FR.md`](docs/COMMENCE_ICI_FR.md) — project entry point and state overview
- [`docs/TACHES.md`](docs/TACHES.md) — task list
- [`docs/BACKEND_STRUCTURE_FR.md`](docs/BACKEND_STRUCTURE_FR.md) — backend architecture reference
- [`docs/FRONTEND_STRUCTURE_FR.md`](docs/FRONTEND_STRUCTURE_FR.md) — frontend architecture reference
- [`CLAUDE.md`](CLAUDE.md) — repo conventions and gotchas (read this before contributing)

## License

Private project, no public license yet.

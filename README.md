[🇫🇷 Lire en français](README.fr.md)

# InSeconds 🎵

> Daily music blind test. Listen as briefly as you can, guess artist + title. Less time = more points. Same challenge for everyone, every day.

## Quick start

### Prerequisites

- Docker Desktop (for the database + API containers)
- Node.js 22+ and npm
- Angular CLI 20+ (`npm install -g @angular/cli`)
- .NET 10 SDK (only required if you want to run the API outside Docker)

### Run the backend

From the repo root:

```bash
docker compose up -d
```

This starts:

- `inseconds.database` — SQL Server 2025 on `localhost:1433`
- `inseconds.api` — .NET 10 API on `http://localhost:5171` with `dotnet watch` hot-reload

The API automatically applies EF Core migrations on startup, so the database is ready as soon as the container is healthy.

### Run the frontend

From the repo root:

```bash
cd src/front/InSeconds.Client
npm install   # only the first time
npm start
```

Open `http://localhost:5172`. You should see the welcome page and a green "Backend OK" badge confirming the API is reachable.

### Useful URLs

| URL | Purpose |
|-----|---------|
| `http://localhost:5172` | Frontend (Angular dev server) |
| `http://localhost:5171/health` | API health check |
| `http://localhost:5171/openapi/v1.json` | OpenAPI spec (used by NSwag client generation, later) |

## Stack

| Layer | Tech |
|-------|------|
| Backend | .NET 10, Wolverine messaging, FluentValidation, EF Core 10 |
| Database | SQL Server 2025 (Developer edition) |
| Frontend | Angular 20 (standalone + signals), TypeScript, Tailwind CSS v4, SCSS |
| Infra | Docker Compose, `dotnet watch` (backend), `ng serve` (frontend) |

## Repository structure

```
InSeconds/
├── docs/                      # Architecture notes (FR)
├── src/
│   ├── back/
│   │   ├── InSeconds.slnx     # .NET solution
│   │   └── InSeconds.Api/     # Web API (vertical slice architecture)
│   └── front/
│       └── InSeconds.Client/  # Angular app
├── docker-compose.yml         # database + api services
├── docker-compose.dcproj      # Visual Studio integration
└── README.md / README.fr.md   # This file
```

## Continuous integration

A GitHub Actions workflow runs on every push (any branch) and every pull request to `main`:

- **Backend job** — restores, builds the `.slnx` solution in Release, and verifies that no EF Core model change is missing a migration (`dotnet ef migrations has-pending-model-changes`)
- **Frontend job** — `npm ci` + production build of the Angular app

Both jobs run in parallel on Ubuntu runners (~3-4 minutes per push). Stale runs on the same branch are cancelled automatically when a new commit lands.

**Dependabot** (`.github/dependabot.yml`) opens pull requests for outdated dependencies on a regular schedule:

- NuGet — weekly
- npm — weekly
- GitHub Actions — monthly
- Docker base images — monthly

CI does **not** spin up Docker or the database at this stage — no integration tests yet. When they are added (likely with Testcontainers), an extra job will start a SQL Server service container.

## Documentation

- [`docs/TACHES.md`](docs/TACHES.md) — MVP task list (French)
- [`docs/BACKEND_STRUCTURE_FR.md`](docs/BACKEND_STRUCTURE_FR.md) — backend architecture reference
- [`docs/FRONTEND_STRUCTURE_FR.md`](docs/FRONTEND_STRUCTURE_FR.md) — frontend architecture reference (some details are now outdated, see project memory for current decisions)
- [`CLAUDE.md`](CLAUDE.md) — repo conventions and gotchas (read this if you contribute)

## License

Private project, no public license yet.

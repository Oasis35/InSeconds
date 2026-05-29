[🇬🇧 Read in English](README.md)

# InSeconds 🎵

> Blind test musical quotidien. Écoute le moins longtemps possible, devine artiste + titre. Moins de temps = plus de points. Même défi pour tout le monde, chaque jour.

## Démarrage rapide

### Prérequis

- Docker Desktop (pour les conteneurs base de données + API)
- Node.js 22+ et npm
- Angular CLI 20+ (`npm install -g @angular/cli`)
- .NET 10 SDK (uniquement si tu veux lancer l'API hors Docker)

### Lancer le backend

Depuis la racine du repo :

```bash
docker compose up -d
```

Ça démarre :

- `inseconds.database` — SQL Server 2025 sur `localhost:1433`
- `inseconds.api` — API .NET 10 sur `http://localhost:5171` avec hot-reload `dotnet watch`

L'API applique automatiquement les migrations EF Core au démarrage, la base est donc prête dès que le conteneur est sain.

### Lancer le frontend

Depuis la racine du repo :

```bash
cd src/front/InSeconds.Client
npm install   # uniquement la première fois
npm start
```

Ouvre `http://localhost:5172`. Tu dois voir la page d'accueil avec un badge vert "Backend OK" confirmant que l'API est joignable.

### URLs utiles

| URL | Usage |
|-----|-------|
| `http://localhost:5172` | Frontend (serveur de dev Angular) |
| `http://localhost:5171/health` | Healthcheck de l'API |
| `http://localhost:5171/openapi/v1.json` | Spec OpenAPI (utilisée plus tard par NSwag pour générer le client TS) |

## Stack

| Couche | Tech |
|--------|------|
| Backend | .NET 10, Wolverine (messaging), FluentValidation, EF Core 10 |
| Base de données | SQL Server 2025 (édition Developer) |
| Frontend | Angular 20 (standalone + signals), TypeScript, Tailwind CSS v4, SCSS |
| Infra | Docker Compose, `dotnet watch` (backend), `ng serve` (frontend) |

## Structure du dépôt

```
InSeconds/
├── docs/                      # Notes d'architecture (FR)
├── src/
│   ├── back/
│   │   ├── InSeconds.slnx     # Solution .NET
│   │   └── InSeconds.Api/     # Web API (vertical slice)
│   └── front/
│       └── InSeconds.Client/  # Application Angular
├── docker-compose.yml         # services database + api
├── docker-compose.dcproj      # intégration Visual Studio
└── README.md / README.fr.md   # ce fichier
```

## Intégration continue

Un workflow GitHub Actions tourne à chaque push (toutes branches) et chaque pull request vers `main` :

- **Job backend** — restore, build `.slnx` en Release, et vérifie qu'aucun changement de modèle EF Core n'attend une migration (`dotnet ef migrations has-pending-model-changes`)
- **Job frontend** — `npm ci` + build de production de l'app Angular

Les deux jobs tournent en parallèle sur des runners Ubuntu (~3-4 minutes par push). Les runs obsolètes sur une même branche sont annulés automatiquement quand un nouveau commit arrive.

**Dependabot** (`.github/dependabot.yml`) ouvre des pull requests pour les dépendances obsolètes à intervalle régulier :

- NuGet — hebdomadaire
- npm — hebdomadaire
- GitHub Actions — mensuel
- Images Docker de base — mensuel

La CI **ne démarre pas** Docker ou la base à ce stade — pas encore de tests d'intégration. Quand on en aura (probablement avec Testcontainers), un job supplémentaire lancera un service container SQL Server.

## Documentation

- [`docs/TACHES.md`](docs/TACHES.md) — Liste des tâches MVP
- [`docs/BACKEND_STRUCTURE_FR.md`](docs/BACKEND_STRUCTURE_FR.md) — Référence d'architecture backend
- [`docs/FRONTEND_STRUCTURE_FR.md`](docs/FRONTEND_STRUCTURE_FR.md) — Référence d'architecture frontend (certains détails sont obsolètes — voir la mémoire projet pour les décisions actuelles)
- [`CLAUDE.md`](CLAUDE.md) — conventions et pièges du repo (à lire si tu contribues)

## Licence

Projet privé, pas encore de licence publique.

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

Workflow GitHub Actions à chaque push et chaque PR vers `main` :

- **Backend** — build en Release + `dotnet ef migrations has-pending-model-changes`
- **Frontend** — `npm ci` + build de production

Les runs obsolètes sont annulés automatiquement. Pas de Docker/BD en CI pour l'instant — les tests d'intégration utiliseront Testcontainers quand ils arriveront.

## Documentation

- [`docs/COMMENCE_ICI_FR.md`](docs/COMMENCE_ICI_FR.md) — point d'entrée et état du projet
- [`docs/TACHES.md`](docs/TACHES.md) — liste des tâches
- [`docs/BACKEND_STRUCTURE_FR.md`](docs/BACKEND_STRUCTURE_FR.md) — référence d'architecture backend
- [`docs/FRONTEND_STRUCTURE_FR.md`](docs/FRONTEND_STRUCTURE_FR.md) — référence d'architecture frontend
- [`CLAUDE.md`](CLAUDE.md) — conventions et pièges du repo (à lire avant de contribuer)

## Licence

Projet privé, pas encore de licence publique.

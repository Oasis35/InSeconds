[🇬🇧 Read in English](README.md)

# InSeconds 🎵

**▶ Joue maintenant : [https://inseconds.cc](https://inseconds.cc)**

[![CI](https://github.com/Oasis35/InSeconds/actions/workflows/ci.yml/badge.svg)](https://github.com/Oasis35/InSeconds/actions/workflows/ci.yml)

![Captures d'écran InSeconds](docs/screenshot.jpg)

> Blind test musical quotidien. Écoute le moins longtemps possible, devine artiste + titre. Moins de temps = plus de points. Même défi pour tout le monde, chaque jour.

## Comment ça marche

- Chaque jour à minuit UTC, un nouveau set de morceaux est sélectionné automatiquement (uniquement des morceaux avec une preview Deezer active, hors cooldown de réutilisation configurable) ; si la génération de minuit a raté, le défi est régénéré automatiquement à l'arrivée du premier joueur (sélection déterministe : même défi pour tout le monde)
- La disponibilité des previews est re-vérifiée chaque nuit auprès de Deezer (appels par lots, respectueux du rate-limit) ; les admins peuvent aussi la relancer à la demande depuis le tableau de bord des tâches planifiées (`/jobs`)
- La lecture démarre automatiquement au palier le plus court (0,5 s) ; tu prolonges palier par palier (1, 1.5, 2, 3, 5, 10 s) avec « écouter plus » avant de tenter artiste + titre
- Prolongations "écouter plus" libres et illimitées par morceau (jusqu'au dernier palier) — le score dépend toujours du palier final écouté, sans malus
- Un bouton « Passer (0 pts) » (avec confirmation) permet de passer au morceau suivant sans répondre
- Indices optionnels (année de sortie, puis nom d'artiste masqué) débloqués à 5s/10s d'écoute — coûte des points, contrôlé côté serveur
- Le scoring est entièrement côté serveur — impossible de tricher côté client
- À chaque révélation, un histogramme montre en combien de temps les autres joueurs ont trouvé ce morceau
- Mode guest : joue sans créer de compte (pas de classement, seulement des stats globales)
- Comptes utilisateurs optionnels (inscription ouverte à tous, connexion sans mot de passe par lien magique) — conserve historique/streak entre appareils ; le jeu guest reste ouvert à tous
- Série quotidienne affichée dans l'en-tête (panneau de détail au clic), avec des gels de série pour les comptes connectés (1 offert à l'inscription, +1 tous les 7 jours, 2 max, utilisés automatiquement sur un jour manqué)
- Après la partie, tu vois où tu te situes : un égaliseur des scores du jour avec le plus bas, la médiane et le plus haut, et la part des joueurs que tu bats (à partir de 5 joueurs)
- Partage de score en format emoji Wordle (copie dans le presse-papier)
- Disponible en français et en anglais — détecté automatiquement depuis le navigateur, changeable à tout moment depuis le pied de page (choix sauvegardé en localStorage)
- Page confidentialité et mentions légales sur `/privacy` (alias `/confidentialite`)
- Installable sur l'écran d'accueil (PWA), mise à jour automatiquement à un moment sûr (jamais en pleine manche)
- Liste des appareils connectés à ton compte, déconnexion d'un appareil ou de tous les autres

## Démarrage rapide

> Le dépôt contient deux versions : la **v2** (`src/v2/`, la référence, servie sur le staging) et la v1 (`src/back`, `src/front`), encore en prod jusqu'à la bascule puis supprimée. Ce qui suit concerne la v2. Pour la v1 : `git show b38825d:README.fr.md`.

### Prérequis

- Docker (base PostgreSQL de dev, et tests d'intégration)
- .NET 10 SDK
- Node.js ≥ 22.22 et npm

### Lancer la base et l'API

```bash
cp .env.example .env   # uniquement la première fois, puis renseigner DB_PASSWORD
docker compose up -d database

cd src/v2/back
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=inseconds;Username=inseconds;Password=<DB_PASSWORD>" \
  dotnet run --project InSeconds.Api.Testing
```

`InSeconds.Api.Testing` est l'API avec un faux Deezer, un faux envoi d'email et les routes `/api/e2e/*` (jamais dans l'image de prod) ; `InSeconds.Api` est l'API réelle. Les migrations sont appliquées au démarrage.

### Lancer le frontend

```bash
cd src/v2/front/InSeconds.Client
npm ci        # uniquement la première fois
npm start
```

Ouvre `http://localhost:5176`.

### URLs utiles

| URL | Usage |
|-----|-------|
| `http://localhost:5176` | Frontend (serveur de dev Angular, relaie `/api` vers l'API) |
| `http://localhost:5175/health` | Liveness de l'API — renvoie aussi la date de build (`build`) |
| `http://localhost:5175/health/ready` | Readiness de l'API (base de données joignable) |
| `http://localhost:5175/jobs` | Tableau de bord Hangfire des tâches planifiées (compte admin) |

## Stack

| Couche | Tech |
|--------|------|
| Backend | .NET 10, monolithe modulaire (Players, Catalogue, Gameplay, Daily), Wolverine (endpoints HTTP, transactions, outbox), FluentValidation, EF Core 10, Hangfire |
| Base de données | PostgreSQL 17, un schéma par module (Docker en dev, conteneur Postgres partagé sur le VPS en prod) |
| Frontend | Angular 22 (standalone, zoneless, signals), NgRx SignalStore, Tailwind CSS v4, élément audio HTML, PWA |
| Musique | API Deezer (recherche, extraits de 30 s, pochettes) |
| Tests | xUnit v3 + Testcontainers, NetArchTest, Vitest (mode navigateur), Sheriff, Playwright |
| Observabilité | OpenTelemetry (logs, traces, métriques en OTLP) → Grafana Cloud ; erreurs front relayées par l'API ; code d'erreur affiché au joueur |
| Déploiement | VPS OVH (Debian), Docker Compose derrière Caddy et Cloudflare, CI/CD GitHub Actions |

## Structure du dépôt

```
InSeconds/
├── deploy/                    # VPS : Postgres partagé, Caddy, scripts de déploiement, import v1 → v2
├── docs/                      # Documentation (FR) : point d'entrée, règles du jeu, tâches, plan v2
├── scripts/                   # Contrôle de parité des E2E v1/v2, lancement E2E v1
├── src/
│   ├── v2/
│   │   ├── back/              # InSeconds.slnx : Api (modules), Infrastructure, Deezer, Api.Testing, tests/
│   │   └── front/InSeconds.Client/  # Application Angular (domaines account, gameplay, daily, admin)
│   ├── back/                  # v1 (jusqu'à la suppression de la v1)
│   └── front/                 # v1 (jusqu'à la suppression de la v1)
├── docker-compose.yml         # Dev : base (+ API v1)
├── docker-compose.staging.yml # Staging (v2)
├── docker-compose.prod.yml    # Prod v1 jusqu'à la bascule
├── docker-compose.prod-v2.yml # Prod après la bascule (workflow « Bascule v2 »)
└── README.md / README.fr.md
```

## Intégration continue

Workflow GitHub Actions sur chaque push (toutes branches) et chaque PR vers `main`. Jobs v2 :

- **back-v2** — build, tests unitaires, d'architecture et d'intégration (Testcontainers), migrations à jour, codegen Wolverine à jour, image Docker sans l'hôte de test
- **front-v2** — build de prod, tests Vitest, frontières Sheriff, clients NSwag à jour
- **e2e-v2** — Playwright contre l'hôte de test
- **nginx-headers-v2** — construit l'image nginx du front et vérifie en-têtes de cache et de sécurité, types MIME et redirection de l'ancienne adresse
- **e2e-parity** — les E2E v1 et v2 portent les mêmes titres (écarts justifiés)

Les jobs v1 tournent aussi tant que la v1 existe. Le check **« CI OK »** les agrège (c'est lui qu'exige la protection des branches). Les runs obsolètes sont annulés automatiquement. Détail : [`CLAUDE.md`](CLAUDE.md) § CI.

## Tests

### Backend

```bash
cd src/v2/back
dotnet test --solution InSeconds.slnx   # unitaires + architecture + intégration (Docker requis)
```

Quatre projets dans `tests/` : unitaires (règles du domaine, sans base), architecture (frontières des modules, NetArchTest), intégration (Testcontainers + Respawn : un vrai PostgreSQL, l'API en mémoire) et migrations.

### Frontend

```bash
cd src/v2/front/InSeconds.Client
npx ng test --watch=false   # Vitest dans un vrai Chromium
npm run lint:arch           # frontières des domaines (Sheriff)
```

### E2E (Playwright)

```bash
cd src/v2/front/InSeconds.Client
E2E_DB_CONNECTION="Host=localhost;Port=5432;Database=inseconds_e2e;Username=inseconds;Password=<DB_PASSWORD>" npm run e2e
```

`playwright.config.ts` démarre l'hôte de test (port 5177) et `ng serve` (port 5178). **110 tests** répartis sur 26 fichiers, repris de la v1 avec les mêmes titres (contrôle de parité) : jeu, connexion, profil, série et gels, admin…

## Documentation

- [`docs/COMMENCE_ICI_FR.md`](docs/COMMENCE_ICI_FR.md) — point d'entrée : pitch, stack, où trouver quoi
- [`CLAUDE.md`](CLAUDE.md) — conventions, modèle de données, déploiement, pièges connus (à lire avant de contribuer)
- Architecture : [`src/v2/back/CLAUDE.md`](src/v2/back/CLAUDE.md) (backend), [`src/v2/front/CLAUDE.md`](src/v2/front/CLAUDE.md) (frontend)
- [`docs/GAMEPLAY_RULES_FR.md`](docs/GAMEPLAY_RULES_FR.md) — règles de jeu (scoring, prolongation, anti-triche, série) — ce qui est réellement appliqué vs juste configuré
- [`docs/TACHES.md`](docs/TACHES.md) — ce qui reste à faire
- [`docs/refonte-v2/`](docs/refonte-v2/) — plan et suivi de la v2

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE) — libre d'utilisation, de modification et de distribution pour tout usage non-commercial (personnel, éducatif, hobby, recherche). Un usage commercial nécessite un accord séparé avec l'auteur.

## Contact

<contact@inseconds.cc>

[🇬🇧 Read in English](README.md)

# InSeconds 🎵

**▶ Joue maintenant : [https://inseconds.cc](https://inseconds.cc)**

[![CI](https://github.com/Oasis35/InSeconds/actions/workflows/ci.yml/badge.svg)](https://github.com/Oasis35/InSeconds/actions/workflows/ci.yml)

![Captures d'écran InSeconds](docs/screenshot.jpg)

> Blind test musical quotidien. Écoute le moins longtemps possible, devine artiste + titre. Moins de temps = plus de points. Même défi pour tout le monde, chaque jour.

## Comment ça marche

- Chaque jour à minuit UTC, un nouveau set de morceaux est sélectionné automatiquement (uniquement des morceaux avec une preview Deezer active, hors cooldown de réutilisation, qui suit la taille du pool : une part réglable du pool jouable reste bloquée) ; si la génération de minuit a raté, le défi est régénéré automatiquement à l'arrivée du premier joueur (sélection déterministe : même défi pour tout le monde)
- La disponibilité des previews est re-vérifiée chaque nuit auprès de Deezer (appels par lots, respectueux du rate-limit), ainsi que les genres de l'album de chaque morceau (un appel par album) ; les admins peuvent aussi la relancer à la demande depuis le tableau de bord des tâches planifiées (`/jobs`)
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
- Tes données (RGPD) : copie de toutes tes données en JSON et suppression définitive de ton compte (section « Tes données » du profil) ; appareils sans visite depuis 91 jours et comptes inactifs depuis 3 ans supprimés automatiquement chaque nuit ; ce que tu tapes en réponse n'est jamais stocké

## Démarrage rapide

### Prérequis

- Docker (base PostgreSQL de dev, et tests d'intégration)
- .NET 10 SDK
- Node.js ≥ 22.22.3 (exigé par Angular CLI 22.2) et npm

### Lancer la base et l'API

```bash
cp .env.example .env   # uniquement la première fois, puis renseigner DB_PASSWORD
docker compose up -d database

cd src/back
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=inseconds;Username=inseconds;Password=<DB_PASSWORD>" \
  dotnet run --project InSeconds.Api.Testing
```

`InSeconds.Api.Testing` est l'API avec un faux Deezer, un faux envoi d'email et les routes `/api/e2e/*` (jamais dans l'image de prod) ; `InSeconds.Api` est l'API réelle. Les migrations sont appliquées au démarrage.

### Lancer le frontend

```bash
cd src/front/InSeconds.Client
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
├── deploy/                    # VPS : Postgres partagé et sauvegardes, Caddy, scripts de déploiement, tableaux Grafana
├── docs/                      # Documentation (FR) : point d'entrée, règles du jeu, tâches, architecture, exploitation, conformité, mode Run, historique
├── src/
│   ├── back/                  # InSeconds.slnx : Api (modules), Infrastructure, Deezer, Api.Testing, tests/
│   └── front/InSeconds.Client/  # Application Angular (domaines account, gameplay, daily, admin)
├── docker-compose.yml         # Dev : base
├── docker-compose.staging.yml # Staging
├── docker-compose.prod.yml    # Prod
└── README.md / README.fr.md
```

## Intégration continue

Workflow GitHub Actions sur chaque push (toutes branches) et chaque PR vers `main` :

- **back** — build, tests unitaires, d'architecture et d'intégration (Testcontainers), migrations à jour, codegen Wolverine à jour, image Docker sans l'hôte de test
- **front** — build de prod, tests Vitest, frontières Sheriff, clients NSwag à jour
- **e2e** — Playwright contre l'hôte de test
- **nginx-headers** — construit l'image nginx du front et vérifie en-têtes de cache et de sécurité, types MIME et redirection de l'ancienne adresse

Le check **« CI OK »** les agrège (c'est lui qu'exige la protection des branches). Les runs obsolètes sont annulés automatiquement. Détail : [`docs/exploitation/ci.md`](docs/exploitation/ci.md).

Livraison : les PR visent `env/staging`, déployée sur le staging une fois « CI OK » passé ; après test, `env/staging` est mergée dans `main` (merge commit), qui déploie la prod de la même façon. Détail : [`docs/exploitation/deploiement.md`](docs/exploitation/deploiement.md).

## Tests

### Backend

```bash
cd src/back
dotnet test --solution InSeconds.slnx   # unitaires + architecture + intégration (Docker requis)
```

Quatre projets dans `tests/` : unitaires (règles du domaine, sans base), architecture (frontières des modules, NetArchTest), intégration (Testcontainers : un vrai PostgreSQL avec une base neuve par classe de tests, l'API en mémoire) et les scripts SQL lancés à la main sur le VPS (`deploy/vps`).

### Frontend

```bash
cd src/front/InSeconds.Client
npx ng test --watch=false   # Vitest dans un vrai Chromium
npm run lint:arch           # frontières des domaines (Sheriff)
```

### E2E (Playwright)

```bash
cd src/front/InSeconds.Client
E2E_DB_CONNECTION="Host=localhost;Port=5432;Database=inseconds_e2e;Username=inseconds;Password=<DB_PASSWORD>" npm run e2e
```

`playwright.config.ts` démarre l'hôte de test (port 5177) et `ng serve` (port 5178). **126 tests** répartis sur 31 fichiers : jeu, connexion, profil, appareils, tes données, série et gels, admin…

## Documentation

- [`docs/README.md`](docs/README.md) — point d'entrée : pitch, stack, où trouver quoi
- [`CLAUDE.md`](CLAUDE.md) — conventions, modèle de données, pièges connus (à lire avant de contribuer)
- Architecture : [`src/back/CLAUDE.md`](src/back/CLAUDE.md) (backend), [`src/front/CLAUDE.md`](src/front/CLAUDE.md) (frontend), [`docs/architecture/`](docs/architecture/) (décisions, frontières entre modules)
- [`docs/regles-du-jeu.md`](docs/regles-du-jeu.md) — règles de jeu (scoring, prolongation, anti-triche, série) — ce qui est réellement appliqué vs juste configuré
- [`docs/exploitation/`](docs/exploitation/) — déploiement sur le VPS, staging, sauvegardes, CI, accès de secours
- [`docs/conformite/`](docs/conformite/) — conditions de l'API Deezer, RGPD
- [`docs/runs/`](docs/runs/README.md) — le futur mode Run (conçu, pas encore codé)
- [`docs/taches.md`](docs/taches.md) — ce qui reste à faire
- [`docs/historique/`](docs/historique/) — la refonte de 2026

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE) — libre d'utilisation, de modification et de distribution pour tout usage non-commercial (personnel, éducatif, hobby, recherche). Un usage commercial nécessite un accord séparé avec l'auteur.

## Contact

<contact@inseconds.cc>

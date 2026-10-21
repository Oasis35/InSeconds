# InSeconds 🎵 — COMMENCE ICI

> **Point d'entrée** de la documentation projet. Pour le quick start utilisateur, voir [README.fr.md](../README.fr.md) à la racine. Pour les conventions code et pièges connus, voir [CLAUDE.md](../CLAUDE.md).

## Pitch

InSeconds est un **blind test musical quotidien**. La lecture démarre au palier le plus court (0,5 s) et le joueur prolonge l'écoute s'il le souhaite (paliers : 0.5, 1, 1.5, 2, 3, 5, 10) avant de tenter artiste + titre. Moins il écoute, plus il marque. Même défi pour tout le monde, chaque jour, à minuit UTC. Mode invité disponible (joue sans s'inscrire).

## Stack

| Couche | Tech |
|--------|------|
| Backend | .NET 10, monolithe modulaire (Players, Catalogue, Gameplay, Daily), Wolverine (endpoints HTTP, transactions, outbox), FluentValidation, EF Core 10, Hangfire (tâches planifiées) |
| Base de données | PostgreSQL 17, un schéma par module (conteneur partagé sur le VPS en prod, image Docker en dev) |
| Frontend | Angular 22 (standalone, zoneless, signals), NgRx SignalStore, Tailwind CSS v4, élément audio HTML (son), PWA (service worker) |
| Musique | API Deezer (recherche, extraits de 30 s, pochettes), client découpé en ports, recherche publique en cache |
| Tests | xUnit v3 + Testcontainers, tests d'architecture (NetArchTest), Vitest en mode navigateur, Sheriff (frontières du front), Playwright |
| CI | GitHub Actions (check agrégateur « CI OK »), Dependabot, SonarCloud |
| Observabilité | OpenTelemetry (logs, traces, métriques) → Grafana Cloud, erreurs front relayées par l'API |
| Déploiement | VPS OVH (Debian) — front + API + Postgres en Docker derrière Caddy et Cloudflare, déploiement par la CI |

## Architecture en deux mots

- **Backend** : une API découpée en **modules** (`Players`, `Catalogue`, `Gameplay`, `Daily`) qui ne se parlent que par leurs `Contracts`, règle vérifiée par des tests d'architecture. Endpoints Wolverine.Http, une transaction par requête, messages durables dans une outbox PostgreSQL, tâches de nuit dans Hangfire.
- **Frontend** : domaines calqués sur les modules (`account`, `gameplay`, `daily`, `admin`), chacun en quatre couches (`domain`, `data-access`, `feature`, `ui`), frontières vérifiées par Sheriff ; un client NSwag par module.
- **Modèle de données** : schémas `players`, `catalogue`, `daily`, plus `infra`, `messaging` et `jobs`. Détail dans le [`CLAUDE.md`](../CLAUDE.md) racine.
- **Anti-triche** : score calculé uniquement par le serveur, une partie par joueur et par défi, plancher d'écoute et niveau d'indice tenus par le serveur, rien qui identifie un morceau avant la réponse.

## État du dépôt

Le code est dans `src/` ; le staging (`dev.inseconds.cc`) reçoit d'abord chaque PR (`env/staging`), la prod suit par un merge vers `main`. Prochaines étapes : CSP bloquante (#300), fin de la reprise des anciens cookies (#237), puis la suite du mode Run, dont le socle back est posé ([`runs/`](runs/README.md)). Le détail est dans [`taches.md`](taches.md).

## Où trouver quoi

Chaque information n'est écrite qu'à un seul endroit, pour éviter que des copies parallèles dérivent du code.

| Besoin | Document |
|--------|----------|
| Installer et lancer le projet | [`README.fr.md`](../README.fr.md) |
| Conventions, modèle de données, pièges connus | [`CLAUDE.md`](../CLAUDE.md) racine |
| Détail backend (modules, routes, tâches, authentification) | [`src/back/CLAUDE.md`](../src/back/CLAUDE.md) |
| Détail frontend (domaines, stores, lecteur, E2E) | [`src/front/CLAUDE.md`](../src/front/CLAUDE.md) |
| Règles de jeu (scoring, anti-triche, série, indices) | [`regles-du-jeu.md`](regles-du-jeu.md) |
| Ce qui reste à faire | [`taches.md`](taches.md) |
| **Nouveau mode Run (Platines)**, conçu, pas encore codé | |
| Sommaire du mode | [`runs/README.md`](runs/README.md) |
| Règles du proto 1 | [`runs/regles.md`](runs/regles.md) |
| Écrans (maquettes de référence) | [`runs/ecrans.md`](runs/ecrans.md) |
| Conception technique | [`runs/conception.md`](runs/conception.md) |
| Feuille de route, découpage en PR, idées de bonus | [`runs/plan.md`](runs/plan.md) |
| **Architecture** | |
| Décisions déjà prises, et pourquoi | [`architecture/decisions.md`](architecture/decisions.md) |
| Frontières entre modules (`Contracts/`) | [`architecture/contrats-entre-modules.md`](architecture/contrats-entre-modules.md) |
| **Exploitation** | |
| VPS, stacks, staging, sauvegardes, commandes utiles | [`exploitation/deploiement.md`](exploitation/deploiement.md) |
| CI, SonarCloud, Dependabot | [`exploitation/ci.md`](exploitation/ci.md) |
| Accès SSH de secours | [`exploitation/acces-secours-ssh.md`](exploitation/acces-secours-ssh.md) |
| Postgres partagé, sauvegardes (mode d'emploi) | [`deploy/infra/README.md`](../deploy/infra/README.md) |
| Caddy, filtre Cloudflare | [`deploy/caddy/README.md`](../deploy/caddy/README.md) |
| Tableaux de bord Grafana | [`deploy/grafana/README.md`](../deploy/grafana/README.md) |
| **Conformité** | |
| Conditions de l'API Deezer | [`conformite/conditions-api-deezer.md`](conformite/conditions-api-deezer.md) |
| RGPD : ce qui est en place | [`conformite/rgpd.md`](conformite/rgpd.md) |
| **Historique** | |
| Refonte de 2026 (plan, découpage en PR, bascule) | [`historique/refonte-2026/`](historique/refonte-2026/) |

## Quick start technique

```bash
# Base PostgreSQL locale (créer .env avec DB_PASSWORD la première fois)
cp .env.example .env
docker compose up -d database

# API (hôte de test : faux Deezer et faux email, http://localhost:5175)
cd src/back
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=inseconds;Username=inseconds;Password=<DB_PASSWORD>" \
  dotnet run --project InSeconds.Api.Testing

# Front (http://localhost:5176)
cd src/front/InSeconds.Client
npm ci
npm start
```

Voir le [README](../README.fr.md) pour les détails.

---

**Pour démarrer une nouvelle fonctionnalité, lire [CLAUDE.md](../CLAUDE.md), [`architecture/decisions.md`](architecture/decisions.md) puis [`taches.md`](taches.md).**

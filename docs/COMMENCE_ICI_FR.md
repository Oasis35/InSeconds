# InSeconds 🎵 — COMMENCE ICI

> **Point d'entrée** de la documentation projet. Pour le quick start utilisateur, voir [README.fr.md](../README.fr.md) à la racine. Pour les conventions code et pièges connus, voir [CLAUDE.md](../CLAUDE.md).

## Pitch

InSeconds est un **blind test musical quotidien**. La lecture démarre au palier le plus court (0,5 s) et le joueur prolonge l'écoute s'il le souhaite (paliers : 0.5, 1, 1.5, 2, 3, 5, 10) avant de tenter artiste + titre. Moins il écoute, plus il marque. Même défi pour tout le monde, chaque jour, à minuit UTC. Mode invité disponible (joue sans s'inscrire).

## Stack (v2)

| Couche | Tech |
|--------|------|
| Backend | .NET 10, monolithe modulaire (Players, Catalogue, Gameplay, Daily), Wolverine (endpoints HTTP, transactions, outbox), FluentValidation, EF Core 10, Hangfire (tâches planifiées) |
| Base de données | PostgreSQL 17, un schéma par module (conteneur partagé sur le VPS en prod, image Docker en dev) |
| Frontend | Angular 22 (standalone, zoneless, signals), NgRx SignalStore, Tailwind CSS v4, élément audio HTML (son), PWA (service worker) |
| Musique | API Deezer (recherche, extraits de 30 s, pochettes), client découpé en ports avec cache |
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

Le code de référence est dans `src/v2/` : il sert la prod depuis le 16/10/2026 et le staging. `src/back` et `src/front` sont du code mort, supprimé à la PR I2. Où en est le chantier : ticket GitHub #205.

## Où trouver quoi

Chaque information n'est écrite qu'à un seul endroit, pour éviter que des copies parallèles dérivent du code.

| Besoin | Document |
|--------|----------|
| Installer et lancer le projet | [`README.fr.md`](../README.fr.md) |
| Conventions, modèle de données, pièges connus, déploiement | [`CLAUDE.md`](../CLAUDE.md) racine |
| Détail backend v2 (modules, routes, tâches, authentification, import) | [`src/v2/back/CLAUDE.md`](../src/v2/back/CLAUDE.md) |
| Détail frontend v2 (domaines, stores, lecteur, E2E) | [`src/v2/front/CLAUDE.md`](../src/v2/front/CLAUDE.md) |
| Règles de jeu (scoring, anti-triche, série, indices) | [`GAMEPLAY_RULES_FR.md`](GAMEPLAY_RULES_FR.md) |
| Ce qui reste à faire | [`TACHES.md`](TACHES.md) |
| Plan de la v2, décisions, découpage en PR | [`refonte-v2/PLAN.md`](refonte-v2/PLAN.md), [`refonte-v2/DEVELOPPEMENT.md`](refonte-v2/DEVELOPPEMENT.md) |
| Import v1 → v2 et bascule | [`deploy/migration-v2/README.md`](../deploy/migration-v2/README.md) |
| Postgres partagé, sauvegardes | [`deploy/infra/README.md`](../deploy/infra/README.md) |

`BACKEND_STRUCTURE_FR.md` et `FRONTEND_STRUCTURE_FR.md` ne sont plus que des renvois vers ces fichiers.

## Quick start technique

```bash
# Base PostgreSQL locale (créer .env avec DB_PASSWORD la première fois)
cp .env.example .env
docker compose up -d database

# API v2 (hôte de test : faux Deezer et faux email, http://localhost:5175)
cd src/v2/back
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=inseconds;Username=inseconds;Password=<DB_PASSWORD>" \
  dotnet run --project InSeconds.Api.Testing

# Front v2 (http://localhost:5176)
cd src/v2/front/InSeconds.Client
npm ci
npm start
```

Voir le [README](../README.fr.md) pour les détails.

---

**Pour démarrer une nouvelle feature, lire [CLAUDE.md](../CLAUDE.md) puis [`TACHES.md`](TACHES.md).**

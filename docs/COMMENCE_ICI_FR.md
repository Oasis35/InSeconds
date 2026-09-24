# InSeconds 🎵 — COMMENCE ICI

> **Point d'entrée** de la documentation projet. Pour le quick start utilisateur, voir [README.fr.md](../README.fr.md) à la racine. Pour les conventions code et pièges connus, voir [CLAUDE.md](../CLAUDE.md).

## Pitch

InSeconds est un **blind test musical quotidien**. La lecture démarre automatiquement au premier palier (0,5 s) et le joueur prolonge l'écoute s'il le souhaite (paliers : 0.5, 1, 1.5, 2, 3, 5, 10) avant de tenter artiste + titre. Moins il écoute, plus il marque. Même défi pour tout le monde, chaque jour, à minuit UTC. Mode guest disponible (joue sans s'inscrire).

## Stack actuelle

| Couche | Tech |
|--------|------|
| Backend | .NET 10, Wolverine (messaging), FluentValidation, EF Core 10 |
| Base de données | PostgreSQL (conteneur partagé sur le VPS en prod, image Docker en dev) |
| Frontend | Angular 22 (standalone + signals), TypeScript, Tailwind CSS v4, SCSS |
| Musique | API Deezer (intégrée — recherche + preview + extraction `CoverHash`) |
| Infra dev | Docker Compose, `dotnet watch` (back), `ng serve` (front) |
| CI | GitHub Actions (build back + front + check migrations EF + tests unitaires back et front + tests d'intégration Testcontainers + E2E Playwright + contrôle des headers nginx de l'image de prod), déploiement VPS auto sur push `main`, Dependabot |
| Observabilité | OpenTelemetry (logs, traces, métriques) → Grafana Cloud, erreurs front relayées par l'API — cf. `CLAUDE.md` § Observabilité |
| Déploiement | VPS OVH (Debian) — front + API + Postgres en Docker derrière Caddy (reverse proxy, HTTPS auto), CI/CD GitHub Actions sur push `main` |

## Architecture en deux mots

- **Backend** : Vertical Slice Architecture — chaque feature vit dans son propre dossier `Features/<Aggregate>/<UseCase>/` (Endpoint + Command/Query + Handler + Validator). Pas de couche service partagée fourre-tout. Wolverine route les messages aux handlers par convention.
- **Frontend** : Angular 22 standalone (pas de NgModules) avec signals pour l'état. Tailwind utility-first par-dessus SCSS pour les overrides locaux.
- **Modèle de données** : 10 tables (`Players`, `Tracks`, `DailyChallenges`, `DailyChallengeTracks`, `GameSessions`, `GameSessionAnswers`, `Settings`, `MagicLinkTokens`, `EmailChangeTokens`, `DataProtectionKeys`). Détail dans le [`CLAUDE.md`](../CLAUDE.md) racine.
- **Gameplay anti-triche** : scoring serveur seulement, contrainte unique `(PlayerId, DailyChallengeId)` qui garantit 1 partie/jour/joueur, durée d'écoute = choix discret (pas une mesure → pas de tentative de manipulation client).

## Où trouver quoi

Chaque information n'est écrite qu'à un seul endroit, pour éviter que des copies parallèles dérivent du code.

| Besoin | Document |
|--------|----------|
| Installer et lancer le projet | [`README.fr.md`](../README.fr.md) |
| Conventions, pièges connus, état de ce qui est livré, déploiement | [`CLAUDE.md`](../CLAUDE.md) racine |
| Détail backend (slices, entités, services `Common/`) | [`src/back/InSeconds.Api/CLAUDE.md`](../src/back/InSeconds.Api/CLAUDE.md), [`src/back/InSeconds.Deezer/CLAUDE.md`](../src/back/InSeconds.Deezer/CLAUDE.md) |
| Détail frontend (jeu, admin) | [`features/game/CLAUDE.md`](../src/front/InSeconds.Client/src/app/features/game/CLAUDE.md), [`features/admin/CLAUDE.md`](../src/front/InSeconds.Client/src/app/features/admin/CLAUDE.md) |
| Règles de jeu (scoring, anti-triche, série, indices) | [`GAMEPLAY_RULES_FR.md`](GAMEPLAY_RULES_FR.md) |
| Ce qui reste à faire | [`TACHES.md`](TACHES.md) |

`BACKEND_STRUCTURE_FR.md` et `FRONTEND_STRUCTURE_FR.md` ne sont plus que des renvois vers ces fichiers.

## Quick start technique

```bash
# Cloner, créer .env (DB_PASSWORD) puis démarrer le stack backend (DB + API hot-reload)
cp .env.example .env
docker compose up -d

# Lancer le frontend
cd src/front/InSeconds.Client
npm install   # première fois seulement
npm start
```

Puis ouvrir `http://localhost:5173`. Voir le [README](../README.fr.md) pour les détails.

---

**Pour démarrer une nouvelle feature, lire [CLAUDE.md](../CLAUDE.md) puis [`TACHES.md`](TACHES.md).**

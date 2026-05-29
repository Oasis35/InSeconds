# InSeconds 🎵 — COMMENCE ICI

> **Point d'entrée** de la documentation projet. Pour le quick start utilisateur, voir [README.fr.md](../README.fr.md) à la racine. Pour les conventions code et pièges connus, voir [CLAUDE.md](../CLAUDE.md).

## Pitch

InSeconds est un **blind test musical quotidien**. Le joueur choisit combien de secondes il veut écouter (paliers : 1, 2, 3, 5, 10, 15, 30) avant de tenter artiste + titre. Moins il écoute, plus il marque. Même défi pour tout le monde, chaque jour, à minuit UTC. Mode guest disponible (joue sans s'inscrire, hors classement).

## Stack actuelle

| Couche | Tech |
|--------|------|
| Backend | .NET 10, Wolverine (messaging), FluentValidation, EF Core 10 |
| Base de données | SQL Server 2025 (Developer edition, en Docker) |
| Frontend | Angular 20 (standalone + signals), TypeScript, Tailwind CSS v4, SCSS |
| Musique | API Deezer (publique, à intégrer) |
| Infra dev | Docker Compose, `dotnet watch` (back), `ng serve` (front) |
| CI | GitHub Actions (build back + front + check migrations EF), Dependabot |
| Déploiement | Pas encore configuré (Railway ou Azure App Service à terme) |

## Architecture en deux mots

- **Backend** : Vertical Slice Architecture — chaque feature vit dans son propre dossier `Features/<Aggregate>/<UseCase>/` (Endpoint + Command/Query + Handler + Validator). Pas de couche service partagée fourre-tout. Wolverine route les messages aux handlers par convention.
- **Frontend** : Angular 20 standalone (pas de NgModules) avec signals pour l'état. Tailwind utility-first par-dessus SCSS pour les overrides locaux.
- **Modèle de données** : 7 tables (`Players`, `Tracks`, `DailyChallenges`, `DailyChallengeTracks`, `GameSessions`, `GameSessionAnswers`, `Settings`). Voir [`BACKEND_STRUCTURE_FR.md`](BACKEND_STRUCTURE_FR.md) pour le détail.
- **Gameplay anti-triche** : scoring serveur seulement, contrainte unique `(PlayerId, DailyChallengeId)` qui garantit 1 partie/jour/joueur, durée d'écoute = choix discret (pas une mesure → pas de tentative de manipulation client).

## Les autres documents de ce dossier

| Document | Contenu |
|----------|---------|
| [`TACHES.md`](TACHES.md) | Liste de toutes les tâches MVP — coche ce qui est fait, voir reste à faire |
| [`BACKEND_STRUCTURE_FR.md`](BACKEND_STRUCTURE_FR.md) | Référence d'architecture backend (vertical slice, modèle EF, Wolverine, services Common) |
| [`FRONTEND_STRUCTURE_FR.md`](FRONTEND_STRUCTURE_FR.md) | Référence d'architecture frontend (Angular 20, AudioPlayer durée-choisie, structure dossiers) |

## Quick start technique

```bash
# Cloner et démarrer le stack backend (DB + API hot-reload)
docker compose up -d

# Lancer le frontend
cd src/front/InSeconds.Client
npm install   # première fois seulement
npm start
```

Puis ouvrir `http://localhost:5172`. Voir le [README](../README.fr.md) pour les détails.

## État du projet

✅ **Fait** :

- Scaffolding backend complet (.slnx, projet API, packages Wolverine/EF/FluentValidation)
- Architecture vertical slice posée (dossiers `Features/`, `Domain/`, `Infrastructure/`, `Common/` vides)
- 7 entités du domaine + configurations EF + migration `InitialCreate` appliquée
- Setup Docker : conteneurs `inseconds.database` (SQL 2025) + `inseconds.api` (hot-reload), volumes, healthcheck
- Scaffolding frontend complet (Angular 20 + Tailwind v4 + SCSS)
- Page d'accueil front avec ping `/health` validant le bout-en-bout
- CI GitHub Actions (build back/front + check migrations) + Dependabot
- Documentation : README bilingue + CLAUDE.md + docs/

🚧 **À faire** : tout le métier — les services `TextNormalizer` / `ScoreCalculator`, le client Deezer, le générateur de défi, les vertical slices Sessions/Leaderboard/Auth, les composants UI Game/BlindRound/Leaderboard, l'auth via cookie HTTP-only, NSwag pour générer le client TS, les tests. Voir [`TACHES.md`](TACHES.md) pour la liste complète et l'ordre suggéré.

## Specs gameplay clés (rappel rapide)

- **10 morceaux par jour**, même set pour tout le monde
- **Paliers d'écoute** : 1, 2, 3, 5, 10, 15, 30 secondes (configurable via la table `Settings`)
- **1 prolongation** autorisée par réponse (passe au palier supérieur, scoring sur le palier final)
- **Timer de saisie** : 20s après la fin de la lecture pour saisir artiste + titre (configurable)
- **Scoring partiel** : `ArtistCorrect` et `TitleCorrect` séparés
- **Anti-triche** : scoring 100% serveur, contrainte BD `UNIQUE (PlayerId, DailyChallengeId)`, durée stockée = palier choisi (validée côté serveur contre la liste autorisée)
- **Mobile-first** : `playsinline` audio, `100dvh`, inputs ≥ 16px, `touch-action: manipulation`

## Mode guest

Le joueur peut jouer le défi du jour **sans créer de compte** :

- Un `Player { IsGuest=true, Pseudo=null }` est créé automatiquement au 1ᵉʳ appel
- Un cookie HTTP-only signé porte le `Player.AuthToken` pour le reconnaître
- Le guest n'apparaît **pas au leaderboard** (filtre `IsGuest=0` sur la query)
- Promotion guest → inscrit = simple UPDATE sur le même `Player` (historique conservé)
- Cleanup périodique des guests inactifs > 30 jours

---

**Bon courage Clément ! Pour reprendre la conversation Claude là où elle s'est arrêtée, ouvre la session existante. Pour démarrer une nouvelle feature, lis [CLAUDE.md](../CLAUDE.md) puis [`TACHES.md`](TACHES.md) pour choisir la prochaine slice. 🎵🚀**

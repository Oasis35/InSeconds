# InSeconds — Liste des Tâches

> Mis à jour le 2026-06-08.

## ✅ Bootstrap projet

- [x] Repo Git, structure `src/back/` + `src/front/` + `docs/`
- [x] Docker Compose : `inseconds.database` (PostgreSQL) + `inseconds.api` (.NET 10 hot-reload)
- [x] README bilingue (FR + EN) + `CLAUDE.md`
- [x] CI GitHub Actions : build back + front + check migrations EF

## ✅ Backend

- [x] Solution `InSeconds.slnx` (format `.slnx` obligatoire)
- [x] Vertical slice architecture (Features / Domain / Infrastructure / Common)
- [x] 7 entités + configurations EF + migrations PostgreSQL
- [x] Settings chargés depuis la BD via `AppDbConfigurationSource` → `IOptions<AppSettings>`
- [x] `TextNormalizer` (Levenshtein) + tests unitaires
- [x] `ScoreCalculator` (paliers `decimal`, scoring partiel, malus prolongation) + tests unitaires
- [x] `CookieAuthService` — guest auto, cookie HttpOnly `SameSite=None` en prod
- [x] `DeezerClient` — recherche + preview + extraction `CoverHash`
- [x] `BackgroundService` génération défi quotidien (3h UTC)
- [x] Slice `Sessions/StartSession` + `Sessions/SubmitAnswer` (scoring serveur + stats)
- [x] Slice `Stats/Today` — score joueur, médiane (`PERCENTILE_CONT(0.5)`), stats par morceau
- [x] Page admin : login Bearer, pool morceaux, création défis, reset sessions
- [x] `ListenedDurationSeconds` / `TotalDurationSeconds` en `decimal` (paliers 0.5, 1, 1.5, 2, 3, 5, 10)
- [x] Tests unitaires : `TextNormalizer`, `ScoreCalculator`, `CookieAuthService`, `StartSessionHandler`, `SubmitAnswerHandler`, `AppSettingsBindingTests`, `GenerateDailyChallengeTests`

## ✅ Frontend

- [x] Angular 20 standalone + signals, Tailwind v4, port 5173
- [x] `SettingsService` — charge les Settings BD au boot, expose des signals
- [x] `AudioPlayerService` — modèle "durée choisie", signal-based
- [x] `GameComponent` — session complète, récap final avec liens Deezer
- [x] `BlindRoundComponent` — choix palier, lecture, prolongation, timer, feedback stats
- [x] `AdminComponent` — login, pool, défis, recherche Deezer
- [x] `playerAuthInterceptor` + `adminAuthInterceptor`
- [x] NSwag : `ApiClient` généré, `api.generated.ts` commité
- [x] Pages d'erreur : 404, "déjà joué" (compte à rebours + stats), "pas de défi"
- [x] Écran "déjà joué" : ton score vs médiane, accordéon détail par morceau (pochette + lien Deezer)

## ✅ Déploiement

- [x] Déploiement Northflank (front + back + PostgreSQL addon)
- [x] CI/CD auto sur push `main`
- [x] Secrets prod via Northflank (`AdminPassword`, connection string)

## 🚧 Tests

- [ ] Tests d'intégration back (Testcontainers) : flow StartSession → SubmitAnswer × N
- [ ] Tests front Karma/Jasmine (`AudioPlayerService`, `GameService`)
- [ ] Tests E2E Playwright (flux complet 1 partie)

## 🚧 Mobile

- [ ] Tests sur vrai appareil iOS (Safari + Chrome iOS)
- [ ] Tests sur vrai appareil Android (Chrome)
- [ ] Vérifier audio en mode silencieux iOS

## 🚧 Polish & Launch

- [ ] Smoke tests automatisés post-deploy
- [ ] Charte graphique / palette de couleurs (`@theme` Tailwind)
- [ ] Audit accessibilité WCAG 2.1 AA
- [ ] Vérifier politique d'usage API Deezer (CGU, rate limits)
- [ ] RGPD : anonymisation au soft-delete (pas juste `IsDeleted=true`)
- [ ] Mentions légales + CGU minimales

## Décisions définitives (ne pas réimplémenter)

- **Pas de Leaderboard** — app volontairement simple, stats globales suffisent
- **Pas d'Auth Register** — tout le monde joue en guest, pas de pseudo

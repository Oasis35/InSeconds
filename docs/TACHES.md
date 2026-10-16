# InSeconds — Reste à faire

> Mis à jour le 2026-10-14 (relecture de cohérence de la v2). Ce fichier ne liste que ce qui reste à faire : l'historique de ce qui est livré vit dans git et les PR, et l'état courant dans [`CLAUDE.md`](../CLAUDE.md) (§ Ce que fait l'application). Une tâche terminée est retirée d'ici, pas cochée. Les tâches sont écrites pour la v2 ; le suivi de la refonte elle-même est dans le ticket #205 et ses sous-tickets.

## Refonte v2 : jusqu'au bout

- [ ] **Bascule en prod** (H, #234) — avant : `DATA_PROTECTION_CERTIFICATE_PASSWORD` dans `.env.prod`, Cloudflare Access sur `api.inseconds.cc/jobs`, créneau hors 22 h 30 – 1 h UTC (cf. `refonte-v2/DEVELOPPEMENT.md` § 9)
- [ ] **Corrections de la relecture du 13/10, avant la bascule** (`audit/relecture-v2-coherence-2026-10-13.md`) — G6a #312 (copie prod → staging limitée à `public`, job CI `deploy` derrière « CI OK », Dependabot, commentaires CSP), G6b #313 (« Réessayer » déverrouille le son sur iPhone), G6c #314 (journaux compatibles avec les tableaux Grafana), G6d #315 (surveillance des tâches Hangfire)
- [ ] **Recette iPhone : page zoomée et son qui coupe** (#233) — lire les messages `Viewport:` et `AudioStall:` dans Grafana (`/api/client-errors`), corriger, puis retirer ces deux diagnostics (`src/v2/front/CLAUDE.md` § Erreurs)
- [ ] **Sauvegarde de la base juste avant la bascule** et timer `inseconds-backup` installé (cf. #234)
- [ ] **CSP bloquante** (G3b, #300) — une semaine sans violation en prod en `report-only`, puis `CSP_MODE=enforce`
- [ ] **Nettoyage après la bascule** — I1 (sauvegarde archivée, tables v1 de `public`, routes en 410), I2 (code et jobs CI v1, `src/v2` → `src`, exclusion de duplication SonarCloud `src/front/**, src/back/**`), I3 (`legacy_tokens`, middleware de transition, anciennes clés Data Protection)
- [ ] **Profil : cartes Série / Parties jouées / Gels** (#283) — après la bascule (décision du 14/10 : la v2 part sans)
- [ ] **Petites dettes du front v2** — clés i18n de l'admin reprises de la v1 qui ne servent plus ; formats de date numériques qui ne suivent pas la langue ; `aria-label` des boutons ‹ › du tableau de bord

## Mode entraînement (anciens défis)

> Rejouer un défi passé sans impacter les stats ni la série. Score calculé côté serveur mais non persisté.

- [ ] **Backend** — démarrer une partie d'entraînement sur un défi passé (route dédiée de Daily) : jamais le défi du jour, hors de la contrainte « une partie par joueur et par défi », rien d'écrit dans `daily.sessions` (ou une partie marquée « entraînement »)
- [ ] **Backend** — réponses d'entraînement : score calculé et renvoyé normalement, mais ni série, ni statistiques, ni réponse enregistrée
- [ ] **Frontend** — page ou modale « Rejouer un ancien défi » accessible depuis l'écran « déjà joué » ou l'accueil ; liste les derniers défis disponibles
- [ ] **Frontend** — indicateur visuel « Mode entraînement » pendant la partie, récap final sans partage ni mise à jour de la série
- [ ] **UX** — décider si les anciens défis sont accessibles sans limite (tout l'historique) ou en fenêtre glissante (ex : 7 derniers jours)

## Rétention & engagement

> Inspiré des mécaniques Wordle / Heardle / NYT Connections. Priorité décroissante.

- [ ] **Badges de difficulté** — récompense visuelle selon la durée moyenne écoutée (ex : « Légende » si moyenne ≤ 1 s, « Explorateur » si ≤ 3 s)
- [ ] **Meilleur score personnel** — stocker et afficher le record du joueur sur chaque morceau (écran « déjà joué »)
- [ ] **Classement du jour anonyme** — top scores + médiane, sans leaderboard permanent

## Infra & exploitation

- [ ] **Grafana Cloud : alertes et tableau de bord** — l'export OpenTelemetry est en place (logs, traces, métriques, cf. `CLAUDE.md` § Ce que fait l'application) ; reste à configurer côté Grafana : alerte mail sur les logs `Error` (API + erreurs front), sonde externe de `https://api.inseconds.cc/health` (Synthetic Monitoring, prévient même si le VPS est à terre), tableau de bord simple (requêtes, temps de réponse, taux d'erreurs, mémoire)
- [ ] **Bruit des erreurs de validation** — en v1, Wolverine loguait en `Error` (avec stack) chaque échec FluentValidation alors que l'API répondait un 400 normal : à revérifier sur la v2 (validation par Wolverine.Http) avant de créer les alertes « erreurs »
- [ ] (optionnel) Collecteur Grafana Alloy sur le VPS pour remonter aussi les logs Caddy/nginx
- [ ] **Sauvegardes de la base : mise en service sur le VPS** — `deploy/infra/backup.sh` + timer systemd (nuit 3 h UTC) sont prêts et les clés R2 sont dans `deploy/infra/.env` (2026-10-11) ; reste à lancer `./backup.sh` puis `./backup.sh restore-test`, installer le timer, créer l'alerte Grafana « aucune sauvegarde en 26 h » (cf. `deploy/infra/README.md` § Sauvegardes)
- [ ] **Tâche récurrente de nettoyage des invités jamais joués** — tâche Hangfire nocturne (comme `players-purge-expired-tokens`) qui supprime logiquement les invités sans aucune partie au-delà d'un seuil (ex : 30 jours). Attention : la règle croise Players et Daily, qui ne se lisent que par leurs contrats
- [ ] Cache Redis en remplacement de `DeezerCache` (utile seulement en multi-instances ou pour survivre aux redémarrages)

## Mobile

- [ ] Tests sur vrai appareil iOS (Safari + Chrome iOS)
- [ ] Tests sur vrai appareil Android (Chrome)
- [ ] Vérifier l'audio en mode silencieux iOS (avec le lecteur v1 repris en v2, #309)
- [ ] Installation de la PWA sur l'écran d'accueil (iOS et Android)

## Polish & conformité

- [ ] Soft 404 : les URLs inexistantes renvoient 200 (fallback SPA), la page 404 n'est rendue que côté Angular
- [ ] Charte graphique / `@theme` Tailwind (palette déjà centralisée en variables CSS `:root`)
- [ ] Audit accessibilité WCAG 2.1 AA
- [ ] RGPD : anonymisation à la suppression d'un joueur (pas juste `deleted_at`)
- [ ] CGU minimales (les mentions légales sont sur `/privacy`)

## Décisions définitives (ne pas réimplémenter)

- **Pas de leaderboard permanent** — app volontairement simple, pas de classement inter-jours (les pseudos existent depuis les comptes, mais ne servent pas à classer). Un classement anonyme du jour reste envisageable
- **Pas de mot de passe** — le jeu reste 100 % jouable en guest ; un compte optionnel (magic link + pseudo) garde historique et série entre appareils

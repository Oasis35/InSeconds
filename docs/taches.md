# InSeconds — Reste à faire

> Mis à jour le 2026-10-16 (après la mise en prod de la v2). Ce fichier ne liste que ce qui reste à faire : l'historique de ce qui est livré vit dans git et les PR, et l'état courant dans [`CLAUDE.md`](../CLAUDE.md) (§ Ce que fait l'application). Une tâche terminée est retirée d'ici, pas cochée. Les tâches sont écrites pour la v2 ; le suivi de la refonte elle-même est dans le ticket #205 et ses sous-tickets.

## Refonte v2 : jusqu'au bout

- [ ] **Suite de la bascule du 16/10/2026** (H, #234) — première nuit (tâches de 23 h, 0 h, 0 h 05 sur healthchecks.io, erreurs dans Grafana), puis au J+1 vider l'`AuthToken` v1
- [ ] **Recette iPhone : page zoomée et son qui coupe** (#233 fermé, recette validée le 16/10) — lire les messages `Viewport:` et `AudioStall:` dans Grafana (`/api/client-errors`), corriger si besoin, puis retirer ces deux diagnostics (`src/front/CLAUDE.md` § Erreurs)
- [ ] **CSP bloquante** (G3b, #300) — une semaine sans violation en prod en `report-only` (depuis le 16/10, premier contrôle dès le 23/10), puis `CSP_MODE=enforce`
- [ ] **Nettoyage après la bascule** — I1 (#235 : une fois la PR I1 déployée, lancer `deploy/vps/drop-v1-tables.sh staging` puis, après le J+1, `deploy/vps/drop-v1-tables.sh prod`, qui archive d'abord une sauvegarde sur R2), I2 (#236, fait en deux PR : code v1, `src/v2` → `src`, scripts d'import ; reste à Clément : supprimer `.bascule-v2-done` et l'ancien `docker-compose.prod-v2.yml` non suivi du checkout de prod s'ils traînent ; `v1-schema.sql` part quand les tables v1 sont supprimées en prod), I3 (`legacy_tokens`, middleware de transition, anciennes clés Data Protection)
- [ ] **Petites dettes du front** — clés i18n de l'admin qui ne servent plus ; formats de date numériques qui ne suivent pas la langue ; `aria-label` des boutons ‹ › du tableau de bord

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
- [ ] **Bruit des erreurs de validation** — Wolverine peut loguer en `Error` (avec stack) chaque échec FluentValidation alors que l'API répond un 400 normal : à vérifier sur la v2 (validation par Wolverine.Http) avant de créer les alertes « erreurs »
- [ ] (optionnel) Collecteur Grafana Alloy sur le VPS pour remonter aussi les logs Caddy/nginx
- [ ] **Sauvegardes de la base : mise en service sur le VPS** — `deploy/infra/backup.sh` + timer systemd (nuit 3 h UTC) sont prêts et les clés R2 sont dans `deploy/infra/.env` (2026-10-11) ; reste à lancer `./backup.sh` puis `./backup.sh restore-test`, installer le timer, créer l'alerte Grafana « aucune sauvegarde en 26 h » (cf. `deploy/infra/README.md` § Sauvegardes)
- [ ] **Tâche récurrente de nettoyage des invités jamais joués** — tâche Hangfire nocturne (ou une étape de plus de `players-purge-expired-tokens`, qui supprime déjà leurs appareils au bout de 91 jours) qui supprime les invités sans aucune partie au-delà d'un seuil (ex : 30 jours). Attention : la règle croise Players et Daily, qui ne se lisent que par leurs contrats
- [ ] Cache Redis en remplacement de `DeezerCache` (utile seulement en multi-instances ou pour survivre aux redémarrages)

## Mobile

- [ ] Tests sur vrai appareil iOS (Safari + Chrome iOS)
- [ ] Tests sur vrai appareil Android (Chrome)
- [ ] Vérifier l'audio en mode silencieux iOS (lecteur audio de #309)
- [ ] Installation de la PWA sur l'écran d'accueil (iOS et Android)

## Polish & conformité

- [ ] Soft 404 : les URLs inexistantes renvoient 200 (fallback SPA), la page 404 n'est rendue que côté Angular
- [ ] Charte graphique / `@theme` Tailwind (palette déjà centralisée en variables CSS `:root`)
- [ ] Audit accessibilité WCAG 2.1 AA
- [x] RGPD : effacement complet d'un joueur (plus de `deleted_at`), copie de ses données, durées de conservation dans la tâche nocturne (PR #351, boutons « Tes données » du profil)
- [ ] CGU minimales (les mentions légales sont sur `/privacy`)

## Décisions définitives (ne pas réimplémenter)

- **Pas de leaderboard permanent** — app volontairement simple, pas de classement inter-jours (les pseudos existent depuis les comptes, mais ne servent pas à classer). Un classement anonyme du jour reste envisageable
- **Pas de mot de passe** — le jeu reste 100 % jouable en guest ; un compte optionnel (magic link + pseudo) garde historique et série entre appareils

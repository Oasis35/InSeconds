# InSeconds — Reste à faire

> Mis à jour le 2026-10-19 (tables v1 supprimées en prod, merge `env/staging` → `main` par #370). Ce fichier ne liste que ce qui reste à faire : l'historique de ce qui est livré vit dans git et les PR, et l'état courant dans [`CLAUDE.md`](../CLAUDE.md) (§ Ce que fait l'application). Une tâche terminée est retirée d'ici, pas cochée. Le suivi de la refonte est dans le ticket #205 et ses sous-tickets, celui du mode Run dans l'epic #368 (cf. [`runs/plan.md`](runs/plan.md)).

## Fin de la refonte

- [ ] **Recette iPhone : page zoomée et son qui coupe** (#233 fermé, recette validée le 16/10) — lire les messages `Viewport:` et `AudioStall:` dans Grafana (`/api/client-errors`), corriger si besoin, puis retirer ces deux diagnostics (`src/front/CLAUDE.md` § Erreurs)
- [ ] **CSP bloquante** (G3b, #300) — déjà `enforce` sur le staging (17/10) ; en prod, une semaine sans violation en `report-only` (depuis le 16/10, premier contrôle dès le 23/10), puis `CSP_MODE=enforce`
- [ ] **Retirer l'outillage de suppression des tables v1** — les tables v1 sont supprimées partout (staging le 16/10, prod le 19/10/2026, #235 fermé) : `deploy/vps/drop-v1-tables.sh`/`.sql`, `DropV1TablesTests` et `v1-schema.sql` n'ont plus d'usage. `ScriptDatabase` (`InSeconds.MigrationTests`) part aujourd'hui du schéma v1 pour toutes ses bases : le faire partir des seules migrations avant de supprimer le fichier, puis retirer son exclusion SonarCloud (`**/v1-schema.sql`, cf. [`exploitation/ci.md`](exploitation/ci.md)). Sur le checkout de prod, supprimer l'ancien `docker-compose.prod-v2.yml` non suivi s'il traîne
- [ ] **Fin de la transition des cookies v1** (I3, #237, vers le 14/01/2027, J+90) — `legacy_tokens`, `LegacyCookieTransitionMiddleware`, anciennes clés Data Protection non chiffrées
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

- [ ] **Grafana Cloud : alertes** — l'export OpenTelemetry (prod seulement) et les trois tableaux de [`deploy/grafana/`](../deploy/grafana/README.md) sont en place ; reste à configurer côté Grafana : alerte mail sur les logs `Error` (API + erreurs front), sonde externe de `https://api.inseconds.cc/health` (Synthetic Monitoring, prévient même si le VPS est à terre)
- [ ] **Cloudflare Access sur `api-dev.inseconds.cc/jobs`** (seulement ce chemin, jamais tout `api-dev`) — à poser s'il ne l'est pas encore ; rien en prod (décision du 14/10/2026, cf. [`architecture/decisions.md`](architecture/decisions.md))
- [ ] **Bruit des erreurs de validation** — Wolverine peut loguer en `Error` (avec stack) chaque échec FluentValidation alors que l'API répond un 400 normal : à vérifier (validation par Wolverine.Http) avant de créer les alertes « erreurs »
- [ ] (optionnel) Collecteur Grafana Alloy sur le VPS pour remonter aussi les logs Caddy/nginx
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
- [ ] CGU minimales (les mentions légales sont sur `/privacy`)

## Décisions définitives (ne pas réimplémenter)

Cf. [`architecture/decisions.md`](architecture/decisions.md).

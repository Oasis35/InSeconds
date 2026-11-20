# InSeconds - Reste à faire

> Ce fichier ne liste que ce qui reste à faire : l'histoire de ce qui est livré vit dans git et les PR, l'état courant dans [`CLAUDE.md`](../CLAUDE.md) (§ Ce que fait l'application). Une tâche terminée est retirée d'ici, pas cochée.

## En cours

- [ ] **Recette iPhone : page zoomée et son qui coupe** - lire les messages `Viewport:` et `AudioStall:` dans Grafana (`/api/client-errors`), corriger si besoin, puis retirer ces deux diagnostics ([`.claude/rules/front/core-pwa.md`](../.claude/rules/front/core-pwa.md) § Remontée des erreurs)
- [ ] **Nettoyage hors du dépôt** - retirer l'exclusion `**/v1-schema.sql` de l'UI SonarCloud (Source File Exclusions : ce fichier n'existe plus) ; sur le checkout de prod, supprimer `docker-compose.prod-v2.yml` (non suivi) s'il traîne
- [ ] **Fin de la reprise des anciens cookies** (#237, vers le 14/01/2027) - `legacy_tokens`, `LegacyCookieTransitionMiddleware`, anciennes clés Data Protection non chiffrées
- [ ] **Petites dettes du front** - clés i18n de l'admin qui ne servent plus ; formats de date numériques qui ne suivent pas la langue

## Mode Survie

Le reste à faire du mode (réglage des barèmes, catalogue épuisé, ouverture à tous) est dans [`runs/plan.md`](runs/plan.md).

## Rétention & engagement

> Inspiré des mécaniques Wordle / Heardle / NYT Connections. Priorité décroissante.

- [ ] **Badges de difficulté** - récompense visuelle selon la durée moyenne écoutée (ex : « Légende » si moyenne ≤ 1 s, « Explorateur » si ≤ 3 s)
- [ ] **Meilleur score personnel** - stocker et afficher le record du joueur sur chaque morceau (écran « déjà joué »)

## Infra & exploitation

- [ ] **Grafana Cloud : alertes** - l'export OpenTelemetry (prod seulement) et les trois tableaux de [`deploy/grafana/`](../deploy/grafana/README.md) sont en place ; reste à configurer côté Grafana : alerte mail sur les logs `Error` (API + erreurs front), sonde externe de `https://api.inseconds.cc/health` (Synthetic Monitoring, prévient même si le VPS est à terre)
- [ ] **Bruit des erreurs de validation** - Wolverine peut loguer en `Error` (avec stack) chaque échec FluentValidation alors que l'API répond un 400 normal : à vérifier (validation par Wolverine.Http) avant de créer les alertes « erreurs »
- [ ] (optionnel) Collecteur Grafana Alloy sur le VPS pour remonter aussi les logs Caddy/nginx
- [ ] **Tâche récurrente de nettoyage des invités jamais joués** - tâche Hangfire nocturne (ou une étape de plus de `players-purge-expired-tokens`, qui supprime déjà leurs appareils au bout de 91 jours) qui supprime les invités sans aucune partie au-delà d'un seuil (ex : 30 jours). Attention : la règle croise Players et Daily, qui ne se lisent que par leurs contrats
- [ ] Cache Redis en remplacement de `DeezerCache` (utile seulement en multi-instances ou pour survivre aux redémarrages)

## Mobile

- [ ] Tests sur vrai appareil iOS (Safari + Chrome iOS)
- [ ] Tests sur vrai appareil Android (Chrome)
- [ ] Vérifier l'audio en mode silencieux iOS (lecteur sur élément `Audio`)
- [ ] Installation de la PWA sur l'écran d'accueil (iOS et Android)

## Polish & conformité

- [ ] Soft 404 : les URLs inexistantes renvoient 200 (fallback SPA), la page 404 n'est rendue que côté Angular
- [ ] Charte graphique / `@theme` Tailwind (palette déjà centralisée en variables CSS `:root`)
- [ ] Audit accessibilité WCAG 2.1 AA
- [ ] CGU minimales (les mentions légales sont sur `/legal`)

## Décisions définitives (ne pas réimplémenter)

Cf. [`architecture/decisions.md`](architecture/decisions.md).

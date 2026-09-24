# InSeconds — Reste à faire

> Mis à jour le 2026-09-24. Ce fichier ne liste que ce qui reste à faire : l'historique de ce qui est livré vit dans git et les PR, et l'état courant dans [`CLAUDE.md`](../CLAUDE.md) (§ Déjà implémenté). Une tâche terminée est retirée d'ici, pas cochée.

## Mode entraînement (anciens défis)

> Rejouer un défi passé sans impacter les stats ni la série. Score calculé côté serveur mais non persisté.

- [ ] **Backend** — nouveau paramètre `trainingMode: true` sur `StartSession` (ou endpoint dédié) : vérifie que le `DailyChallengeId` visé n'est pas le défi du jour, lève la contrainte d'unicité `(PlayerId, DailyChallengeId)`, n'écrit pas de `GameSession` en base (ou la marque `IsTraining=true`)
- [ ] **Backend** — `SubmitAnswer` en mode entraînement : calcule et renvoie le score normalement mais ne le cumule pas dans `GameSessions.TotalScore` / pas de ligne `GameSessionAnswers` persistée
- [ ] **Frontend** — page ou modale « Rejouer un ancien défi » accessible depuis l'écran « déjà joué » ou l'accueil ; liste les derniers défis disponibles
- [ ] **Frontend** — indicateur visuel « Mode entraînement » pendant la partie, récap final sans partage ni mise à jour de la série
- [ ] **UX** — décider si les anciens défis sont accessibles sans limite (tout l'historique) ou en fenêtre glissante (ex : 7 derniers jours)

## Rétention & engagement

> Inspiré des mécaniques Wordle / Heardle / NYT Connections. Priorité décroissante.

- [ ] **Badges de difficulté** — récompense visuelle selon la durée moyenne écoutée (ex : « Légende » si moyenne ≤ 1 s, « Explorateur » si ≤ 3 s)
- [ ] **Meilleur score personnel** — stocker et afficher le record du joueur sur chaque morceau (écran « déjà joué »)
- [ ] **Classement du jour anonyme** — top scores + médiane, sans leaderboard permanent

## Infra & exploitation

- [ ] **Grafana Cloud : alertes et tableau de bord** — l'export OpenTelemetry est en place (logs, traces, métriques, cf. `CLAUDE.md` § Observabilité) ; reste à configurer côté Grafana : alerte mail sur les logs `Error` (API + erreurs front), sonde externe de `https://api.inseconds.cc/health` (Synthetic Monitoring, prévient même si le VPS est à terre), tableau de bord simple (requêtes, temps de réponse, taux d'erreurs, mémoire)
- [ ] **Bruit des erreurs de validation** — Wolverine logue en `Error` (avec stack) chaque échec FluentValidation d'un `bus.InvokeAsync`, alors que l'API répond un 400 normal : à rabaisser (filtre de log ou politique Wolverine) pour ne pas déclencher les alertes « erreurs »
- [ ] (optionnel) Collecteur Grafana Alloy sur le VPS pour remonter aussi les logs Caddy/nginx
- [ ] **Backups PostgreSQL automatiques externalisés** — le VPS est un point de défaillance unique : dump quotidien envoyé hors du VPS (object storage ou équivalent)
- [ ] **Job récurrent de nettoyage des invités jamais joués** — `BackgroundService` nocturne (même pattern que `GenerateDailyChallengeService`) qui soft-delete les `Player` invités sans `GameSession` au-delà d'un seuil (ex : 30 jours) ; la migration `PurgeUnplayedPlayers` n'était qu'un nettoyage ponctuel
- [ ] Élargir les smoke tests post-deploy au-delà des headers nginx (ex : vérifier que `/health` répond depuis l'URL publique juste après déploiement)
- [ ] Cache Redis en remplacement de l'`IMemoryCache` (utile seulement en multi-instances ou pour survivre aux redémarrages)

## Mobile

- [ ] Tests sur vrai appareil iOS (Safari + Chrome iOS)
- [ ] Tests sur vrai appareil Android (Chrome)
- [ ] Vérifier l'audio en mode silencieux iOS

## Polish & conformité

- [ ] Soft 404 : les URLs inexistantes renvoient 200 (fallback SPA), la page 404 n'est rendue que côté Angular
- [ ] Charte graphique / `@theme` Tailwind (palette déjà centralisée en variables CSS `:root`)
- [ ] Audit accessibilité WCAG 2.1 AA
- [ ] Vérifier la politique d'usage de l'API Deezer (CGU, rate limits)
- [ ] RGPD : anonymisation au soft-delete (pas juste `IsDeleted=true`)
- [ ] Mentions légales + CGU minimales

## Décisions définitives (ne pas réimplémenter)

- **Pas de leaderboard permanent** — app volontairement simple, pas de classement inter-jours (les pseudos existent depuis les comptes, mais ne servent pas à classer). Un classement anonyme du jour reste envisageable
- **Pas de mot de passe** — le jeu reste 100 % jouable en guest ; un compte optionnel (magic link + pseudo) garde historique et série entre appareils

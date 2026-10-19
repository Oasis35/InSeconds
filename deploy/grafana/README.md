# Tableaux de bord Grafana

Tableaux de Grafana Cloud (stack UE), **pour la prod seulement** : le staging n'envoie rien à Grafana (`docker-compose.staging.yml` ne transmet aucune variable `OTEL_*`). À importer à la main : Dashboards > New > Import, puis choisir la source de logs Loki (`DS_LOGS`) et la source Prometheus (`DS_PROM`). Rien n'est déployé automatiquement ; l'export OpenTelemetry de l'API est décrit dans [`src/back/CLAUDE.md`](../../src/back/CLAUDE.md) (« OpenTelemetry »).

| Fichier | Tableau | Sources |
|---|---|---|
| `inseconds-exploitation.json` | celui qu'on ouvre en premier : erreurs de l'API (avec la pile en dépliant une ligne), 5xx, erreurs du front (js, http), violations CSP à part, warnings, la nuit (défi, stats figées, extraits, purge), Deezer et emails, temps de réponse, mémoire | logs + métriques |
| `inseconds-joueur.json` | tout ce qui concerne un joueur (actions, erreurs, warnings), filtré sur l'attribut `PlayerId` et non sur le texte | logs |
| `inseconds-activite.json` | parties démarrées, terminées, abandonnées, expirées ; score ; connexions et comptes créés ou effacés ; paliers, indices, artiste et titre trouvés | métriques métier de l'API |

Ils remplacent depuis le 17/10/2026 les cinq tableaux de la v1 (`InSeconds`, `Le jeu`, `Actions joueurs en direct`, `Erreurs et warnings`, `Santé technique`) : les supprimer dans Grafana après l'import. Le détail par morceau n'est plus dans Grafana : l'admin le donne, calculé sur la base.

**Ce qui casse un panneau sans erreur** :
- « Activité » lit les compteurs de `DailyMetrics` et `PlayersMetrics` (`inseconds_daily_sessions_total`, `inseconds_daily_answers_total`, `inseconds_daily_session_score_bucket`, `inseconds_players_sign_ins_total`, `inseconds_players_accounts_erased_total`) : renommer une métrique ou une étiquette le vide. Ces compteurs n'existent que depuis leur déploiement : rien avant.
- « Exploitation » et « Un joueur » filtrent sur le texte de certains messages (« Erreur front », « Erreur front (csp) », « Réponse de », « Défi du », « Contrôle des previews »…, écrits dans les classes `*Log` de `src/back`) : changer un de ces textes vide le panneau, mettre le JSON à jour et le réimporter.
- Les diagnostics temporaires de la recette iPhone (`Viewport:`, `AudioStall`) sont journalisés comme des erreurs du front : ils sont exclus des compteurs et ont leur propre panneau, à retirer avec eux.

Les tâches planifiées et la sauvegarde sont surveillées par healthchecks.io, qui prévient par email (cf. [`docs/exploitation/deploiement.md`](../../docs/exploitation/deploiement.md#sauvegardes-de-la-base)) ; « Exploitation » n'en montre que les journaux.

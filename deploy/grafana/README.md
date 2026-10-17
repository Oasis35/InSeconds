# Tableaux de bord Grafana

Tableaux de Grafana Cloud (stack UE) à importer à la main : Dashboards > New > Import, puis choisir la source de logs Loki (`DS_LOGS`) et, pour `inseconds-sante-technique.json`, la source Prometheus (`DS_PROM`). Rien n'est déployé automatiquement ; l'export OpenTelemetry de l'API est décrit dans le [`CLAUDE.md`](../../CLAUDE.md#ce-que-fait-lapplication) (Observabilité).

| Fichier | Tableau |
|---|---|
| `inseconds-dashboard.json` | vue d'ensemble (parties démarrées, terminées, abandonnées, connexions) |
| `inseconds-jeu.json` | statistiques de jeu (réponses, durées d'écoute, taux de réussite) |
| `inseconds-actions-joueurs.json` | fil des actions d'un joueur (filtre `PlayerId`) |
| `inseconds-erreurs.json` | erreurs et avertissements de l'API et du front |
| `inseconds-sante-technique.json` | métriques HTTP et runtime (noms de métriques non vérifiés) |

**Ces tableaux filtrent sur le texte des messages de log** (« Partie … démarrée par », « Réponse de », « Connexion par magic link », « Erreur front »…, écrits dans `DailyErrors.cs`, `PlayersErrors.cs` et `ReportClientErrorEndpoint.cs` de `src/back/InSeconds.Api`). Changer un de ces textes casse le panneau : mettre à jour le JSON ici et le réimporter.

Les tâches planifiées et la sauvegarde ne sont pas surveillées ici mais par healthchecks.io (cf. [`docs/exploitation/deploiement.md`](../../docs/exploitation/deploiement.md#sauvegardes-de-la-base)).

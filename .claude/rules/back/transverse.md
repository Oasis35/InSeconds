---
paths:
  - "src/back/InSeconds.Infrastructure/**"
  - "src/back/InSeconds.Api/Infrastructure/**"
  - "src/back/InSeconds.Api/Program.cs"
  - "src/back/InSeconds.Api/appsettings*.json"
  - "src/back/InSeconds.Api/Dockerfile"
  - "src/back/tests/**/Security/**"
  - "src/back/tests/**/Jobs/**"
  - "src/back/tests/**/Operations/**"
  - "src/back/tests/**/Infrastructure/**"
---
# Transverse : `InSeconds.Infrastructure` et `InSeconds.Api/Infrastructure`

`InSeconds.Infrastructure` ne connaît ni l'API ni les modules ; `InSeconds.Api/Infrastructure` ne connaît aucun module sauf les points d'entrée nommés (`ApiComposition`, `WolverineSetup`, `PlayerDataCommand`, `FreezeDayStatsCommand`, `InfrastructureDependencyTests`). Ce qui est propre à un module vit dans le module.

## Démarrage (`Hosting/`)

- `Program.cs` : les commandes (`MigrateOnlyCommand`, `RotateDataProtectionKeyCommand`, `FreezeDayStatsCommand`, `PlayerDataCommand`) passent avant toute composition, puis `ApiComposition.AddInSecondsApi` / `UseInSecondsApi` (partagés avec l'hôte de test), puis `RunJasperFxCommands`. Services : réglages en base, observabilité, base, migrations, calendrier, ProblemDetails, santé, Data Protection, auth, proxies, CORS, rate limiting, email, Deezer, Wolverine, Hangfire, `App:PublicUrl`, puis `AddPlayers`, `AddCatalogue`, `AddGameplay`, `AddDaily`, `AddRuns`, `AddSocial`, `AddPlayerDataContributors`. Pipeline : forwarded headers, en-têtes de sécurité, erreurs, CORS, authentification, reprise des anciens cookies, télémétrie du joueur, autorisation, rate limiter, routes. Un ordre changé dans la composition ou le pipeline se justifie : `UseForwardedHeaders` reste en premier (tout le reste voit l'IP réelle), CORS après la gestion des erreurs (ses en-têtes restent sur un 500) et avant l'authentification et le rate limiting (un `OPTIONS` passe sans cookie ni quota).
- Migrations au démarrage (`DatabaseStartupService`, `IHostedLifecycleService.StartingAsync`, avant Wolverine et Hangfire ; `Database:MigrateOnStartup=false` les coupe), puis rechargement des réglages (la table a pu ne pas exister à la construction de la configuration).
- `--freeze-day-stats` réutilise la règle de `daily-close-day` (`CloseChallengeDayHandler.Handle`), refuse de figer si `DailyOptionsChecks.Problems` n'est pas vide (les paliers figés sont ceux des réglages).
- `Hosting/` contient aussi `AppOptions` (`App:PublicUrl`, adresse absolue vérifiée au démarrage), `BuildInfo` (commit et date du build, posés par l'image), `CommandLine`, `LinkSecrets` (chemins qui portent un secret de lien, cf. règle Social).

## Erreurs (`Errors/`)

- `ProblemDetailsSetup` : tout ProblemDetails porte `code` et `traceId` ; un 500 a un titre générique, ni `detail` ni exception (S12). `ApiProblem.Of` fabrique un problème avec son code ; `ErrorCodes` porte les `common.*`.
- `POST /api/client-errors` (`ReportClientErrorEndpoint`, hors client généré : `[ExcludeFromDescription]`) : public, limité par IP, bornes du validateur ; journalisé par `ClientErrorLog` avec un message stable (filtres « Erreur front » des tableaux Grafana) ; `Device` vient de `DeviceLabel`, **jamais le `User-Agent` brut** ; query string et fragment retirés de l'URL côté serveur ; retours à la ligne neutralisés.
- `POST /api/csp-reports` (`ReportCspViolationEndpoint`, `CspReportParser`) : rapports envoyés par le navigateur, deux formats lus sans se fier au `Content-Type`, corps borné, extensions du navigateur écartées, **toujours 204** ; journalisé par `ClientErrorLog` (source `csp`), sans query string.

## Télémétrie (`InSeconds.Infrastructure/Observability`)

- Export OTLP seulement si `OTEL_EXPORTER_OTLP_ENDPOINT` est défini (prod seulement). `/health` et `/jobs` hors des traces. Aucune capture d'en-têtes.
- Métriques : `AddMeter("InSeconds.*")` (`TelemetrySources.Meters`), l'infrastructure ne connaît pas les modules. Chaque module a sa classe singleton sur `IMeterFactory` (`DailyMetrics`, `PlayersMetrics`, `RunsMetrics`, `SocialMetrics`, `CatalogueTelemetry`), appelée à côté du journal de l'événement ; **étiquettes à cardinalité bornée, jamais un identifiant**. Renommer une métrique ou une étiquette vide les panneaux de `deploy/grafana/*.json` (le hook `grafana-reminder` le rappelle). Tests par `MetricCollector` branché sur l'`IMeterFactory` de l'API de test.
- Source de traces d'une nouvelle zone : l'ajouter à `TelemetrySources` et à `ObservabilityExtensions.TracedSources`.
- Journaux EF : `Microsoft.EntityFrameworkCore.Database.Command` en `Warning` en prod, staging et hôte de test ; une écriture refusée par la base (`SaveChangesFailed`, `CommandError`) en `Warning` (`DatabaseServiceCollectionExtensions`), la vraie panne reste en `Error` par le gestionnaire global. `System.Net.Http.HttpClient` en `Warning` en prod et staging (l'URL de ping healthchecks.io y apparaissait).
- `SecretPaths` / `SecretPathScopes` : un secret de lien n'entre ni dans `url.path` d'un span, ni dans le scope `RequestPath` d'un journal.

## HTTP et réseau

- Proxies de confiance : piège 27 et 34 (`TrustedProxyNetworks`, `ForwardLimit = null`).
- Rate limiting : fenêtres glissantes par IP réelle ou par joueur (`PartitionBy`), noms et limites dans `RateLimitPolicies` / `RateLimitingServiceCollectionExtensions.Limits` (stables : le front et les tests les citent). L'identifiant du joueur est fourni par l'API (claim `player_id`) ; sans joueur, une limite par joueur retombe sur l'IP. Refus : 429 `common.too_many_requests` avec `Retry-After`, et un journal `RateLimited: <route>` (`RateLimitLog`, jamais l'IP ni le joueur) pour voir qui se heurte à une limite avant de la resserrer. Les routes de la partie du jour (`daily-start`, `daily-answer`, `daily-hint`) ont des limites très larges, par joueur. `RateLimiting:Enabled=false` en test : les politiques restent posées, rien n'est limité.
- CORS (`CorsSetup`) : origines dans `Cors:AllowedOrigins`, aucune par défaut (dev et E2E passent par le proxy d'`ng serve`).
- En-têtes (`SecurityHeaders`, S15) : posés au démarrage de la réponse, donc aussi sur les erreurs ; `Cache-Control: no-store` partout sauf si la route pose le sien ; `/jobs` a sa propre CSP.
- Emails (`Email/`) : les modules ne voient que `IEmailSender`. `RedirectingEmailSender` obligatoire au staging (`EmailRedirect:To`, l'API refuse de démarrer sans) ; jamais l'adresse dans un journal, ni celle qu'un message d'erreur de Brevo pourrait citer.

## Hangfire (`Jobs/`)

- Schéma `jobs` créé par Hangfire. Serveur si `Jobs:Server:Enabled` (faux dans les tests d'intégration), `Jobs:Server:WorkerCount` (2). `RecurringJobsRegistrar` enregistre les tâches déclarées et **supprime celles qui ne le sont plus**. Cron surchargeable par `Jobs:<id>:Cron`, en UTC.
- `GET /api/admin/jobs/last-runs` (`GetJobLastRunsEndpoint`) : dernier passage de chaque tâche ; une exception autre que `JobFailedException` y est rendue `common.unexpected`, sans message. Rétention des exécutions : 7 jours (`JobsSetup.ExecutionRetention`).
- `JobHeartbeatFilter` est posé sur le serveur (`options.FilterProvider`), **pas** dans `GlobalJobFilters` (partagé par toutes les API de test du processus) ; il signale healthchecks.io après chaque tâche récurrente (sauf celles déclarées `signalHealthchecks: false`, lancées à la main seulement), jamais bloquant, jamais la clé dans un journal. `JobTracingFilter` : une activité par exécution (source `InSeconds.Jobs`).
- `/jobs` : policy Admin, `Authorization = []` (le filtre par défaut de Hangfire n'accepte que localhost), antiforgery (S3).

## Opérations (`Operations/`)

`GET /api/admin/system` : commit de l'API (`BuildInfo`) et état des sauvegardes lu dans `infra.backup_runs` (`BackupRun`). Cette table est écrite par `record_run` de `deploy/infra/backup-common.sh`, hors de l'API : **une colonne changée doit suivre dans ce script** (`MigrationTests/BackupScriptsTests`).

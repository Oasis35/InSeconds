# CLAUDE.md - back

Back d'InSeconds (`src/back`). Vue d'ensemble, règles dures et pièges numérotés : [`CLAUDE.md`](../../CLAUDE.md) racine ; tableau des réglages : `.claude/rules/back/reglages.md`. Ce fichier ne garde que ce qui sert à toute tâche back ; le détail de chaque zone est dans une règle chargée quand on lit un de ses fichiers (cf. [Règles par zone](#règles-par-zone)). Toute PR qui change le back met à jour ce fichier ou la règle concernée.

## Commandes

```bash
cd src/back
dotnet build InSeconds.slnx
dotnet test --solution InSeconds.slnx      # unitaires + architecture + intégration + scripts du VPS (Docker requis)
dotnet run --project InSeconds.Api          # http://localhost:5175
dotnet run --project InSeconds.Api.Testing  # hôte de test : API + /api/e2e + faux email + faux Deezer
docker build -f InSeconds.Api/Dockerfile -t inseconds-api .   # image de prod, sans l'hôte de test

# Après tout ajout ou changement de handler, d'endpoint ou de message, AVANT les tests, puis commiter
rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write

# Nouvelle migration
(cd InSeconds.Api && dotnet ef migrations add <Nom> --output-dir Infrastructure/Persistence/Migrations)
```

`global.json` fixe le lanceur Microsoft.Testing.Platform : `dotnet test --solution …`, jamais `dotnet test InSeconds.slnx` (refusé pour xUnit v3).

Commandes de l'API (`Program.cs`, avant toute composition ; hôte minimal, ni serveur, ni Wolverine, ni Hangfire) :

| Option | Effet | Codes de sortie |
|---|---|---|
| `--migrate-only` | applique les migrations (déploiement, copie prod → staging) | 0 |
| `--rotate-data-protection-key` | crée une clé Data Protection active tout de suite (après une copie de base, piège 17) | 0 |
| `--freeze-day-stats` | fige les stats de tous les jours terminés sans photo, une transaction par jour, rejouable | 0 ; 1 si les réglages ne passent pas `DailyOptionsChecks` ou si un jour a échoué |
| `--export-player <email>` | JSON de `PlayerDataExporter` sur la sortie standard, journaux sur la sortie d'erreur, jamais l'adresse | 0 ; 2 aucun compte ; 64 adresse manquante |
| `--delete-player <email>` | `AccountErasure` dans une transaction | 0 ; 2 ; 64 |

Les deux dernières (`PlayerDataCommand`) enregistrent les contributeurs par `ApiComposition.AddPlayerDataContributors`, la même liste que l'API. Mode d'emploi sur le VPS : `docs/exploitation/deploiement.md`. Une commande Wolverine (`codegen write`) ne démarre pas l'hôte : ni migration, ni lecture des réglages en base (`CommandLine.StartsServer`), la CI génère le code sans base.

## Structure

- `InSeconds.Api` : `Program.cs`, `Infrastructure/` (transverse : `Persistence`, `Settings`, `Time`, `Errors`, `Health`, `Auth`, `Messaging`, `Jobs`, `Operations`, `Hosting`), `Modules/<Module>/` (`Players`, `Catalogue`, `Gameplay`, `Daily`, `Runs`, `Social`), `Internal/Generated/` (code Wolverine, commité).
- `InSeconds.Infrastructure` (email, observabilité, proxies, rate limiting, en-têtes, CORS), `InSeconds.Deezer`, `InSeconds.Waveform` : ne connaissent ni l'API ni les modules (`ProjectDependencyTests`).
- `InSeconds.Api.Testing` : hôte de test, jamais dans l'image de prod (S9).
- `tests/` : `InSeconds.UnitTests`, `InSeconds.ArchitectureTests`, `InSeconds.IntegrationTests` (un dossier par module, plus `Security/`, `Jobs/`, `Messaging/`, `Operations/`, `Testing/`), `InSeconds.MigrationTests` (scripts de `deploy/vps` et `deploy/infra`).
- `scripts/integration-durations.mjs` : durée des tests d'intégration par dossier (répartition des jobs CI).
- Composition : `Infrastructure/Hosting/ApiComposition` (partagée avec l'hôte de test) ; un module s'y ajoute par son `Add<Module>()`, et son contributeur RGPD dans `AddPlayerDataContributors`.

## Compléments aux règles dures

- **Un seul `DbContext`** (`InSecondsDbContext`) ; chaque module y apporte ses `IEntityTypeConfiguration`, découvertes dans l'assembly. Celles de **Players et Catalogue d'abord** : EF ne retrouve une entité par son nom que si elle est déjà dans le modèle, sinon il en crée une autre sans erreur.
- **Schémas** : constantes de `DbSchemas` (un par module, plus `infra`, `extensions`, `messaging`, `jobs`). Un nouveau module ajoute la sienne.
- **Clé étrangère vers un autre module** : déclarée par le **nom du type** en littéral (`HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null)`), jamais par le type ni par une constante (NetArchTest compterait la dépendance). Aucune navigation entre modules.
- **Identifiant connu avant l'enregistrement** (il part dans un cookie, une réponse ou un message) : séquence HiLo propre à la table (`UseHiLo("<table>_hilo", DbSchemas.X)`).
- **CHECK aligné sur le validateur** : une contrainte de base (longueur d'un pseudo, statut, priorité) reprend la règle du validateur FluentValidation, pour qu'un contournement de l'API ne laisse rien passer.
- **Deux collections dans une même requête EF = `.AsSplitQuery()`** (projection ou `Include`), posé requête par requête (pas de réglage global).
- **`citext`** vit dans le schéma `extensions` : ses opérateurs ne sont trouvés que si `extensions` est dans le `search_path`. Toute connexion ouverte hors du `DbContext` passe par `DatabaseServiceCollectionExtensions.WithExtensionsSearchPath`, sinon PostgreSQL compare en `text`, sensible à la casse, sans erreur.
- **Ports** : le store (`I<M>Store`, écritures, agrégats suivis, verrous) est dans `Domain/` ; les ports de lecture (`I<M>Queries`, projections directes) dans `Application/` (le domaine ne les utilise jamais) ; implémentations `Ef…` publiques dans `Persistence/` (Wolverine refuse une implémentation interne au `codegen write`). Politiques du domaine (`ITrackSelector`, `IRunScoringPolicy`…) dans `Domain/`.
- **Table avec une colonne `player_id`** : effacée et exportée par le contributeur RGPD du module (`IPlayerDataContributor`), sinon `PlayerDataTests` échoue (piège 48).
- **Conflit d'unicité attendu** (deux écritures simultanées) : un `IExceptionHandler` du module dérivé de `Infrastructure/Persistence/UniqueViolationExceptionHandler` le rend en 409 avec son code (`AccountConflictExceptionHandler`, `TrackConflictExceptionHandler`, `AliasConflictExceptionHandler`).
- **`SaveChanges`** : la liste des exceptions est celle de `HandlerRulesTests.AllowedSaveChangesCallers` ; une entrée de plus s'y justifie.

## Recette : ajouter un endpoint de bout en bout

1. **Fichier** `Modules/<M>/Application/<Cas>.cs` : records requête et réponse, `AbstractValidator<Requête>`, classe statique `<Cas>Endpoint` (exemple court : `Players/Application/Profile.cs`).
2. **Étapes Wolverine**, dans l'ordre du code généré : `Before` (rare : contrôle d'origine), `LoadAsync` (agrégat ou record de chargement, par le store), `Validate` ou `ValidateAsync` (renvoie `<M>Problems.X()` ou `WolverineContinue.NoProblems`), puis `Get` / `Post` / `Put` / `Delete`. Jamais de `SaveChangesAsync` ni d'`IResult` ; `[EmptyResponse]` pour un 204 ; un message à publier se renvoie (ou `OutgoingMessages`) et part dans la même transaction.
3. **`[NotBody]`** sur tout paramètre complexe chargé ou injecté qui n'est pas le corps (sinon Wolverine tente de le lire dans le corps, 400 sans message), y compris un service concret (`DailyRules`, `DailyMetrics`) quand il est le seul paramètre complexe.
4. **Attributs** : `[WolverinePost("/api/<m>/…", OperationId = "verbeNom")]`, `[Authorize]` si un joueur est exigé (rien à poser pour `/api/admin*` : la policy Admin est automatique, `SecurityTests` le vérifie), `[ProducesResponseType<ProblemDetails>(StatusCodes.Status4xx…)]` pour chaque 401/403/404/409/429 (le 400 de validation est déduit), `[EnableRateLimiting(RateLimitPolicies.X)]` si la route crée, écrit en rafale ou appelle Deezer (politique existante ou nouvelle dans `InSeconds.Infrastructure/RateLimiting`). `[NonTransactional]` seulement pour un traitement long ou une écriture qui doit être visible avant la fin (cas écrits dans les règles des modules).
5. **Code d'erreur** `module.raison` dans `<M>ErrorCodes` (`PlayersErrorCodes`, `CatalogueErrorCodes`, `DailyErrorCodes` / `DailyAdminErrorCodes`, `RunsErrorCodes`, `SocialErrorCodes`, `ErrorCodes` pour `common.*`), ProblemDetails fabriqué dans `<M>Problems` ; jamais renommé ; ajouté à `published-error-codes.json` (liste commitée côté front, vérifiée par `PublishedErrorCodesTests` : `UPDATE_PUBLISHED_ERROR_CODES=1` la réécrit) puis au front dans `ERROR_MESSAGE_KEYS`.
6. **Port** nommé par l'intention (méthode ajoutée au store ou au port de lecture), **migration** si le schéma change.
7. **Codegen** : `rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write`, **avant les tests** (ils relisent le code commité).
8. **Test d'intégration** dans `tests/InSeconds.IntegrationTests/<M>/` (cf. [Tests d'intégration](#tests-dintégration)).
9. **Document OpenAPI** `InSeconds.Api.Testing/openapi/<m>.json` régénéré (cf. [Document OpenAPI](#document-openapi)), puis `npm run generate-api` au front.
10. **Commiter ensemble** : `Internal/Generated`, `openapi/<m>.json`, le client `src/front/…/api/<m>/api.generated.ts` (sinon `back-checks` ou `api-clients` échouent).

## Autres recettes

- **Nouvelle entité** : classe du domaine à constructeur privé et `private set`, configuration `IEntityTypeConfiguration` dans `Persistence/` (schéma `DbSchemas.X`, HiLo si l'identifiant sert avant l'enregistrement, CHECK, clés étrangères inter-modules par le nom du type), méthodes au store, migration générée et relue (`Up` et `Down`), contributeur RGPD si `player_id`.
- **Nouveau réglage** : propriété dans les options du module avec sa valeur par défaut ; options enregistrées par `services.AddOptions<X>().BindConfiguration(X.Section)` et lues par `IOptionsMonitor<X>` (relu à chaud). Pas de valeur initiale sur une liste ou un dictionnaire (défaut dans une propriété `Effective…`), pas de clé de dictionnaire décimale (liste d'objets). Une valeur incohérente fait refuser le démarrage (`DailyOptionsStartupCheck`, `RunsOptionsStartupCheck`) et retombe sur le défaut à l'usage. Ajouter la ligne au tableau de la règle `reglages.md`.
- **Nouvelle tâche Hangfire** : classe `IScheduledJob` avec `Id` et `DefaultCron`, `[DisableConcurrentExecution]` et `[AutomaticRetry]`, enregistrée par `services.AddScheduledJob<TJob>(TJob.Id, TJob.DefaultCron)` ; la tâche n'appelle que des commandes Wolverine (`bus.InvokeAsync`), **une par étape** pour une transaction par étape ; un échec métier lève `JobFailedException("module.code")` ; compte rendu en **dictionnaire** (Hangfire n'écrit pas les propriétés à zéro d'un objet). Ajouter l'identifiant à `ExpectedJobs` de `Jobs/ScheduledJobsTests` et au tableau de la racine ; décaler le cron du staging (`appsettings.Staging.json`). Une tâche **lancée à la main seulement** (`Cron.Never()`) se déclare avec `signalHealthchecks: false` : son contrôle healthchecks.io, créé au premier signal, alerterait faute de passage régulier.
- **Nouveau message Wolverine** : record de message, handler statique `<Message>Handler.Handle`. Un nom stable par `[MessageIdentity("module.nom")]` (posé sur ceux de Players) garde lisible un message en attente dans `messaging` après un renommage de classe. Une file qui ne doit jamais traiter deux messages à la fois se déclare dans `WolverineSetup` (`opts.LocalQueueFor<…>().Sequential()`).

## Wolverine

- **Service location interdite par défaut** : la liste `AlwaysUseServiceLocationFor` de `WolverineSetup` est la règle (services choisis par une fabrique, services qui énumèrent les implémentations d'un contrat, services remplacés par les tests). **Un service que les tests remplacent doit y être**, sinon le code commité le construit en dur et le remplacement est ignoré.
- Outbox et files durables dans le schéma `messaging`, **créées par Wolverine au démarrage**, pas par les migrations (`--migrate-only` ne les crée pas) ; `MapWolverineEnvelopeStorage` les déclare au `DbContext`, elles figurent donc dans le snapshot du modèle mais pas dans une migration.
- Codegen : `Static` en prod et staging (l'API refuse de démarrer si le code est périmé, `StaticCodegenTests`), `Auto` sans écriture en `Testing` (seuls les handlers absents, ceux des tests et de l'hôte de test, sont compilés), `Dynamic` en développement. `codegen write` ne supprime pas les fichiers périmés : toujours `rm -rf` avant.

## Tests d'intégration

- `PostgresFixture` est une fixture d'assembly (`[assembly: AssemblyFixture]`) : un conteneur pour la suite, une base neuve par classe par `CreateDatabaseAsync()` dans `InitializeAsync` (copie d'une base modèle migrée), `CreateEmptyDatabaseAsync()` pour les tests du premier démarrage.
- `new ApiFactory(connectionString, configureServices, settings)` : l'API en mémoire, faux Deezer toujours branché (`api.FakeDeezer`), Hangfire sans serveur (les tests appellent les tâches), rate limiting coupé. `CreateClient(TestUser.Player)` / `TestUser.Admin` simule un joueur par en-têtes ; sans eux, le vrai cookie. `ExecuteAsync(sql)` et `ScalarAsync<T>(sql)` pour préparer ou lire la base.
- Harnais par module : `DailyApi`, `GameApi`, `CatalogueApi`, `MagicLinkApi`, `RunGame`. Journaux : `CapturedLogs` (niveau, EventId, message). Staging simulé : `TestCertificate.StagingSettings()`.
- Noms en français `Situation_Resultat` ; un test d'un piège porte `PiegeNN_` (ou `_PiegeNN`), un test de sécurité `SN_`. Un test qui démarre un vrai serveur Hangfire va dans la collection `HangfireServerCollection` (seule à passer, Hangfire garde un état global).
- `Assert` de xUnit seulement.
- Les classes de tests s'exécutent en parallèle dans un même processus : un `MeterListener` voit les instruments de **tous** les tests, il filtre donc sur `instrument.Meter.Scope` (la fabrique du test) avant d'activer quoi que ce soit. Un rappel de mesure qui lève (un `Assert`, un `Single()`) sur les mesures des autres tests plantait le processus (« Internal CLR error 0x80131506 », un lancement sur trois en CI).

## Règles de sécurité (S1 à S16)

Numéros stables, cités par le code, les tests et `deploy/vps/smoke-test.sh` ; les absents ne servent plus. S10 (`ngsw-config.json` sans `dataGroups`) et S14 (CSP du front) sont côté front : `.claude/rules/front/core-pwa.md`, vérifiées par le job `nginx-headers`.

- **S1** : le jeton d'un lien envoyé par email n'est jamais dans l'outbox, le handler du message le génère (`MagicLinkTests`, `MagicLinkEmailFailureTests`).
- **S2** : un jeton n'est accepté que pour son usage (connexion ou changement d'email) (`MagicLinkTests`, `ProfileTests`).
- **S3** : `/jobs` réservé aux admins, antiforgery sur ses actions (`JobsDashboardTests`).
- **S5** : chaque connexion ouvre une session d'appareil neuve et révoque l'ancienne du navigateur (`MagicLinkTests`).
- **S6** : un ancien cookie n'est accepté que si son hash est dans `legacy_tokens` ; « déconnecter les autres appareils » le supprime (`LegacyCookieTests`, `DevicesTests`).
- **S8** : le staging copié de la prod est anonymisé, sans les clés Data Protection de la prod (`StagingAnonymizeTests`).
- **S9** : l'hôte de test n'est jamais dans l'image de prod (`ProjectDependencyTests`, job `back-checks`, test de fumée).
- **S11** : route qui crée un joueur limitée par IP ; changement d'email et révocations limités par joueur (`ProfileTests`, `DevicesTests`).
- **S12** : un 500 ne contient ni message ni pile, seulement `code`, titre générique et `traceId` (`ProblemDetailsSetup`, `ErrorTests`).
- **S15** : en-têtes de sécurité sur toutes les réponses, erreurs comprises (`SecurityHeadersTests`).
- **S16** : clés Data Protection chiffrées en base par un certificat, exigé en prod et au staging (`DataProtectionTests`).

## Journaux : plages d'EventId

Une plage par module, jamais un identifiant réutilisé (les tableaux Grafana et les filtres en dépendent). Messages `[LoggerMessage]` dans la classe `…Log` du module ; jamais d'email, de pseudo, de nom de groupe, de texte saisi ni d'URL signée ; un paramètre ne s'appelle jamais `{Level}` ni `{Severity}` (Grafana le prendrait pour le niveau du journal).

| Plage | Classe | Zone |
|---|---|---|
| 1000 à 1005, 1300 à 1311 | `DailyLog` | parties ; génération, stats, tâches |
| 1006, 1008 à 1010 | `PlayersLog` | connexion, effacement, purge, pseudo remis à zéro |
| 1007, 1011 | `EmailLog` | emails (`InSeconds.Infrastructure`) |
| 11xx | `ClientErrorLog` | erreurs du front et rapports CSP |
| 1110 | `RateLimitLog` | requête refusée par une limite (la route seulement, `InSeconds.Infrastructure`) |
| 1200 à 1209, 1230 | `CatalogueLog` | pool, candidats, formes d'onde, revérification des extraits |
| 1210 à 1221 | `DeezerLog` | client Deezer |
| 1400 à 1416 (sans 1412 à 1414) | `RunsLog` | Survie |
| 1800 à 1812 | `SocialLog` | groupes, classement |

Un nouvel identifiant prend le suivant de sa plage ; un nouveau module prend une centaine libre (15xx à 17xx).

## Document OpenAPI

Le front génère un client NSwag par module depuis les documents servis par l'hôte de test seulement (`/openapi/<m>.json`, `ApiDocs/OpenApiDocuments`, un `AddModuleDocument` par module filtré sur ses préfixes de routes) et sauvegardés dans `InSeconds.Api.Testing/openapi/<m>.json`. `Le_document_sauvegarde_pour_le_front_est_a_jour` (base `Testing/OpenApiDocumentTests`) échoue si un document est périmé. Pour le régénérer : lancer l'hôte de test (`ASPNETCORE_ENVIRONMENT=Testing`, base dans `ConnectionStrings__DefaultConnection`, `dotnet run --no-launch-profile --project InSeconds.Api.Testing --urls http://localhost:5177`), puis enregistrer `GET /openapi/<m>.json` indenté de 2 espaces dans le fichier du module. Une base jetable suffit (`docker run -d --name pg -e POSTGRES_PASSWORD=x -p 55434:5432 postgres:17-alpine`). Détail des documents : règle `test-host.md`.

## Règles par zone

Dans `.claude/rules/back/`, chargées quand Claude lit un fichier qui correspond :

| Fichier | Zone |
|---|---|
| `players-auth.md` | module Players, authentification, cookie, RGPD |
| `catalogue-deezer.md` | module Catalogue, `InSeconds.Deezer`, `InSeconds.Waveform` |
| `daily.md` | module Daily |
| `runs.md` | module Runs (Survie) |
| `social.md` | module Social (groupes, classement) |
| `gameplay.md` | module Gameplay |
| `transverse.md` | `InSeconds.Infrastructure`, `InSeconds.Api/Infrastructure` (erreurs, télémétrie, Hangfire, démarrage) |
| `test-host.md` | `InSeconds.Api.Testing`, tests, scripts du VPS |
| `reglages.md` | tableau complet des réglages (`infra.settings` et configuration) |

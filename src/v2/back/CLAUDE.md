# CLAUDE.md — back v2 (refonte)

Back de la v2 d'InSeconds, en construction à côté de la v1 (`src/back/`), qui reste en service jusqu'à la bascule. Plan de référence : [`docs/refonte-v2/PLAN.md`](../../../docs/refonte-v2/PLAN.md) et [`docs/refonte-v2/DEVELOPPEMENT.md`](../../../docs/refonte-v2/DEVELOPPEMENT.md). Ce fichier décrit ce qui existe **déjà** dans le code ; il grossit à chaque PR.

État : **PR A6, staging v2** (après A1, le socle, A2, Wolverine et Hangfire, et A3, services transverses : emails, OpenTelemetry, proxies de confiance, rate limiting, en-têtes de sécurité, hôte de test) : CORS, `POST /api/client-errors`, déploiement du staging (cf. « Staging »). Pas encore de module métier ni de vraie connexion (B1) : l'authentification n'a que son socle (cookie, policy Admin).

## Commandes

```bash
cd src/v2/back
dotnet build InSeconds.slnx
dotnet test --solution InSeconds.slnx      # unitaires + architecture + intégration (Docker requis)
dotnet run --project InSeconds.Api          # http://localhost:5175
dotnet run --project InSeconds.Api -- --migrate-only   # applique les migrations puis rend la main
dotnet run --project InSeconds.Api.Testing  # hôte de test (Development) : API + /api/e2e + faux email

# Image de prod (contexte src/v2/back), sans l'hôte de test
docker build -f InSeconds.Api/Dockerfile -t inseconds-api-v2 .

# Régénérer le code Wolverine (après tout ajout ou changement de handler / endpoint), puis commiter
rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write

# Nouvelle migration (depuis src/v2/back/InSeconds.Api)
dotnet ef migrations add <Nom> --output-dir Infrastructure/Persistence/Migrations
```

`global.json` fixe le lanceur de tests **Microsoft.Testing.Platform** (`test.runner`) : avec le SDK .NET 10, `dotnet test` refuse l'ancien mode VSTest pour xUnit v3. D'où `dotnet test --solution …` (et non `dotnet test InSeconds.slnx`).

## Structure

```
src/v2/back/
├── global.json / Directory.Build.props / Directory.Packages.props   # versions centralisées, warnings = erreurs
├── InSeconds.slnx
├── InSeconds.Infrastructure/   # adaptateurs transverses, ne connaît ni l'API ni les modules
│   ├── Email/          # IEmailSender, Brevo, redirection staging
│   ├── Observability/  # OpenTelemetry (OTLP)
│   ├── Networking/     # TrustedProxyNetworks (X-Forwarded-For)
│   ├── RateLimiting/   # politiques par IP
│   └── Http/           # en-têtes de sécurité, CORS
├── InSeconds.Api.Testing/      # hôte de test : API + faux + /api/e2e (jamais dans l'image de prod)
├── InSeconds.Api/
│   ├── Program.cs      # 3 lignes : ApiComposition
│   ├── Dockerfile      # image de prod (Api + Infrastructure seulement)
│   └── Infrastructure/
│       ├── Persistence/   # InSecondsDbContext, schémas, migrations, migrateur
│       ├── Settings/      # réglages en base (infra.settings) → IConfiguration
│       ├── Time/          # IGameCalendar (jour de jeu = jour UTC)
│       ├── Errors/        # ProblemDetails : code + traceId, rien d'interne sur un 500 ; POST /api/client-errors
│       ├── Health/        # /health et /health/ready
│       ├── Auth/          # cookie, policy Admin (socle, complété en B1)
│       ├── Messaging/     # Wolverine (HTTP, transactions, outbox)
│       ├── Jobs/          # Hangfire : tâches planifiées, /jobs, GET /api/admin/jobs/{id}
│       └── Hosting/       # ApiComposition, --migrate-only, commandes Wolverine
│   └── Internal/Generated/   # code Wolverine généré, COMMITÉ (vérifié en CI)
└── tests/
    ├── InSeconds.UnitTests/
    ├── InSeconds.ArchitectureTests/   # règles de dépendance, horloge, schémas
    └── InSeconds.IntegrationTests/    # Testcontainers postgres:17-alpine + WebApplicationFactory
                                       # (Security/ : SecurityTests, en-têtes, proxies ; Testing/ : hôte de test)
```

Les modules métier vivront dans `InSeconds.Api/Modules/<Module>/` ; un module n'utilise des autres que leur dossier `Contracts` (vérifié par `ArchitectureTests/ModuleDependencyTests`, qui s'applique dès qu'un module existe).

## Règles

- **Rien dans le schéma `public`** : la v2 partage la base de la v1 jusqu'à la bascule, et toutes les tables v1 sont dans `public`. Chaque entité déclare son schéma (`infra`, puis un schéma par module). L'historique EF est `infra.__ef_migrations_history`. Vérifié par `PersistenceTests` et `DatabaseTests`.
- **Noms en snake_case** (`EFCore.NamingConventions`).
- **`citext` vit dans le schéma `extensions`** (pas dans `public`). Ses opérateurs, dont `=`, n'y sont trouvés que si `extensions` est dans le `search_path` : `DatabaseServiceCollectionExtensions.WithExtensionsSearchPath` l'ajoute à la chaîne de connexion. Sans lui, PostgreSQL compare en `text`, sensible à la casse, sans aucune erreur (constaté en A1). Toute connexion ouverte hors du `DbContext` sur une colonne `citext` doit passer par cette méthode.
- **Jamais `DateTime.UtcNow`/`Now`/`Today`** (ni `DateTimeOffset`) dans `InSeconds.Api` : l'heure vient de `TimeProvider` ou d'`IGameCalendar` (`Now`, `Today`, `StartOf(jour)`), remplaçables en test par `FakeTimeProvider`. Vérifié par `ClockUsageTests` (scan des sources).
- **Erreurs** : toute réponse d'erreur est un ProblemDetails avec `code` (`ErrorCodes`, ex. `common.not_found`) et `traceId` (32 hex, recherchable dans Grafana). Sur un 500, titre générique, ni `detail` ni exception. Les modules ajouteront leurs propres codes (`daily.xxx`…).
- **Tests** : `Assert` de xUnit uniquement (pas de FluentAssertions, licence payante depuis la v8). Une base neuve par classe de tests d'intégration (`PostgresFixture.CreateDatabaseAsync`), un seul conteneur pour toute la suite.

## Réglages (`infra.settings`)

Une ligne par réglage : `key` = chemin de configuration complet (`Daily:GuessTimerSeconds`), `value` en `jsonb`. `DatabaseSettingsConfigurationProvider` lit la table et l'aplatit dans `IConfiguration` (`SettingsJsonFlattener` : objet → `clé:propriété`, tableau → `clé:0`, `clé:1`…). Les modules lisent leurs options par `IOptionsMonitor<T>` : **tout est relu à chaud**, sans redémarrage.

- Écrire un réglage : `SettingsStore.SetAsync(key, value)` (upsert puis rechargement).
- Après une écriture SQL directe : `ISettingsReloader.Reload()`.
- Le provider ignore seulement « base, schéma ou table absents » (premier démarrage avant migration) ; toute autre erreur SQL empêche le démarrage.
- **Pas de clé de dictionnaire décimale** : le binder .NET laisse un `Dictionary<decimal, …>` vide sans erreur. D'où `DurationScores` stocké en liste d'objets `[{"seconds":0.5,"score":1000},…]`. Les clés `string`, entières ou `enum` fonctionnent (`HintPenaltyPercent` : `{"1":30,"2":60}` → `Dictionary<int,int>`).

## Démarrage

`Program.cs` appelle `ApiComposition.AddInSecondsApi(args)` puis `UseInSecondsApi()`, partagés avec l'hôte de test. Services : réglages en base → OpenTelemetry → `DbContext` → migrations → calendrier → ProblemDetails → health checks → auth → proxies de confiance → rate limiting → email → Wolverine → Hangfire. Pipeline : `UseForwardedHeaders` (en premier : tout le reste voit l'IP réelle) → en-têtes de sécurité → erreurs → authentification → autorisation → rate limiter → routes. Puis `RunJasperFxCommands(args)` (démarre l'API, ou exécute une commande Wolverine comme `codegen write`). Les migrations passent par `DatabaseStartupService` (`IHostedLifecycleService.StartingAsync`) : avant le démarrage de Wolverine et Hangfire, sauf si `Database:MigrateOnStartup=false` ; les réglages sont rechargés juste après (la table peut ne pas avoir existé à la construction de la configuration). Une commande Wolverine ne démarre pas l'hôte : pas de migration, et pas de lecture des réglages en base (`CommandLine.StartsServer`), pour que la CI génère le code sans base.

`--migrate-only` (`MigrateOnlyCommand`) : hôte minimal (base seulement, ni serveur web ni tâche de fond), applique les migrations et rend la main avec le code 0. Sert au déploiement et à l'import des données v1.

## Wolverine (`Infrastructure/Messaging/WolverineSetup.cs`)

- Endpoints en **Wolverine.Http** (`[WolverineGet]`…), validation FluentValidation en ProblemDetails. Toute route `/api/admin*` reçoit la policy Admin (`ConfigureEndpoints`) : impossible d'oublier l'attribut.
- `AutoApplyTransactions` + transactions EF Core : un handler qui modifie le `DbContext` et publie un message fait **une seule transaction** (donnée + outbox). Messages durables dans le schéma **`messaging`** (`PersistMessagesWithPostgresql(cs, "messaging")`, files locales durables). Vérifié par `Messaging/OutboxTests` : message envoyé seulement si la donnée est enregistrée, et aucun message ni enveloppe sinon.
- **Les tables de `messaging` sont créées par Wolverine au démarrage, pas par les migrations EF.** `MapWolverineEnvelopeStorage("messaging")` ne fait que les déclarer au `DbContext` (exclues des migrations ; la migration `MapWolverineEnvelopeStorage` est vide exprès). `--migrate-only` ne les crée donc pas.
- **Codegen statique** : en Production et Staging, `TypeLoadMode.Static` (`WolverineSetup.UsesStaticCodegen`) ; le code est lu dans `Internal/Generated`, commité. Ailleurs, génération à la volée (`UseRuntimeCompilation`). Oublier de régénérer = l'API refuse de démarrer en staging (`MissingPreBuiltTypesException`, testé par `StaticCodegenTests`) ; le job CI `back-v2` supprime le dossier, relance `codegen write` et échoue si le résultat diffère du dépôt. `codegen write` ne supprime pas les fichiers périmés : toujours `rm -rf` avant.

## Tâches planifiées (Hangfire, `Infrastructure/Jobs/`)

- Stockage PostgreSQL dans le schéma **`jobs`** (créé par Hangfire au démarrage, comme `messaging`). Serveur de tâches si `Jobs:Server:Enabled` (défaut `true`, `false` dans les tests d'intégration), `Jobs:Server:WorkerCount` (défaut 2 : peu de tâches, et chaque worker tient une connexion).
- **Déclarer une tâche** : une classe `IScheduledJob` (`RunAsync` renvoie un résultat sérialisé en JSON, ou `null`), enregistrée par `services.AddScheduledJob<TJob>("id", Cron.Daily())`. Planning surchargeable par `Jobs:<id>:Cron`, fuseau UTC. `RecurringJobsRegistrar` enregistre les tâches au démarrage et **supprime celles qui ne sont plus déclarées**. Ajouter la tâche à `ExpectedJobs` de `Jobs/ScheduledJobsTests` (liste vide tant qu'aucun module n'en déclare).
- **Échec métier** : lever `JobFailedException("module.code")` ; le code est renvoyé tel quel. Toute autre exception est rendue en `common.unexpected` (ni message ni pile exposés).
- **Tableau de bord `/jobs`** : policy Admin (401 anonyme, 403 joueur), `Authorization = []` (le filtre par défaut de Hangfire n'accepte que localhost), jeton antiforgery exigé sur ses actions. À protéger en plus par Cloudflare Access avant la mise en ligne (S3).
- **`GET /api/admin/jobs/{id}`** : état d'une exécution (`queued`, `processing`, `succeeded`, `failed`, `retry_scheduled`, `deleted`), `result` (JSON) si réussie, `errorCode` si échouée ; 404 `common.not_found` si l'id est inconnu.
- **Tests avec un vrai serveur Hangfire** (`Jobs:Server:Enabled=true`, ex. `JobStatusTests`) : dans la collection `HangfireServerCollection`, qui passe seule. Hangfire garde son activateur de tâches en global : une autre API de test créée puis détruite en parallèle le remplace, et la tâche échoue sur un `IServiceProvider` détruit (vu en CI sur la PR A6).

## Services transverses (`InSeconds.Infrastructure`)

Projet sans dépendance vers l'API ni les modules (vérifié par `ArchitectureTests/ProjectDependencyTests`). L'API l'utilise par ses méthodes d'extension.

- **Emails** (`Email/`) : les modules dépendent de `IEmailSender` seulement. `BrevoEmailSender` (API transactionnelle Brevo, `Brevo:ApiKey`/`SenderEmail`/`SenderName`, vérifiés au démarrage en Production et Staging). Si `EmailRedirect:To` est renseigné, `RedirectingEmailSender` envoie tout à cette adresse avec un bandeau (objet inchangé) ; **obligatoire en Staging** (l'API refuse de démarrer sans, `EmailStartupTests`). Journaux : sujet et identifiant Brevo (EventId 1007/1101 comme en v1), **jamais l'adresse**, ni celle que le message d'erreur Brevo pourrait citer.
- **OpenTelemetry** (`Observability/`) : mêmes réglages que la v1 (`inseconds-api`, ASP.NET Core, HttpClient, Npgsql, Wolverine, runtime ; logs avec scopes). Export OTLP seulement si `OTEL_EXPORTER_OTLP_ENDPOINT` est défini. `/health` et `/jobs` exclus des traces. Une activité par exécution Hangfire (source `InSeconds.Jobs`, `Jobs/JobTracingFilter` dans l'API). **Confidentialité** : jamais d'email, de pseudo, de réponse saisie, de cookie ni d'`Authorization` ; aucune capture d'en-têtes.
- **Proxies de confiance** (`Networking/TrustedProxyNetworks`) : RFC1918 + loopback (Caddy) et plages Cloudflare, `ForwardLimit = null` (piège 27 du CLAUDE.md racine). Un en-tête `X-Forwarded-For` forgé par un appelant hors de ces plages est ignoré.
- **Rate limiting** (`RateLimiting/`) : fenêtres glissantes par IP réelle, noms et limites de la v1 (`RateLimitPolicies` : `magic-link-request` 5/10 min, `email-change-request` 5/10 min, `player-creation` 30/10 min, `client-error-report` 20/5 min, `deezer-search-public` 60/5 min). Une route s'y inscrit par `RequireRateLimiting(RateLimitPolicies.X)`. Refus : 429 ProblemDetails (`common.too_many_requests`, `Retry-After`). `RateLimiting:Enabled=false` en test (`ApiFactory`, `appsettings.Testing.json` de l'hôte de test) : les politiques restent sur les routes mais ne limitent rien.
- **CORS** (`Http/CorsSetup`) : politique par défaut, repris de la v1 (`AllowAnyHeader`, `AllowAnyMethod`, `AllowCredentials`), origines dans `Cors:AllowedOrigins`. **Aucune par défaut** : en développement et en E2E, le front passe par le proxy d'`ng serve` (même origine). Staging : `https://dev.inseconds.cc` (`appsettings.Staging.json`) ; prod : `https://inseconds.cc` et `https://www.inseconds.cc` (`appsettings.Production.json`, sans effet avant la bascule). `UseCors` juste après la gestion des erreurs (les en-têtes, posés au démarrage de la réponse, restent sur un 500 : le front lit son code d'erreur) et avant l'authentification et le rate limiting (une requête préalable `OPTIONS` passe sans cookie ni quota). Tests : `Security/CorsTests`.
- **En-têtes de sécurité** (`Http/SecurityHeaders`, S15) : `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS 1 an, CSP `default-src 'none'; frame-ancestors 'none'` sur l'API. Le tableau de bord `/jobs` a sa propre CSP : scripts de `/jobs` seulement (Hangfire n'a aucun script en ligne, vérifié par `SecurityHeadersTests`), styles en ligne permis (attributs `style`). Posés au démarrage de la réponse, donc aussi sur les erreurs.

## Hôte de test (`InSeconds.Api.Testing`)

`TestingProgram` : la même composition que l'API, plus les faux et les routes `/api/e2e`. Refuse de démarrer hors `Testing` et `Development`. Jamais dans l'image de prod (S9) : l'API ne le référence pas (`ProjectDependencyTests`), le `Dockerfile` ne le copie pas, et le job CI `back-v2` construit l'image et échoue si `InSeconds.Api.Testing` s'y trouve.

- `CapturingEmailSender` remplace `IEmailSender` (les emails restent en mémoire).
- `POST /api/e2e/reset` : vide (Respawn) les tables de **tous les schémas sauf** `public` (tables v1), `infra`, `extensions`, `messaging` et `jobs`, lus en base à chaque appel (un nouveau module est couvert sans rien changer), et les emails capturés. Sans schéma de module, ne fait rien.
- `GET /api/e2e/last-email?to=` : dernier email envoyé à cette adresse (404 sinon).
- À venir : faux Deezer (C1), seed, connexion admin de test et dev-login (B1), `generate-today` (D).
- Tests : `Testing/TestingFactory` (`WebApplicationFactory<TestingProgram>`).

## Authentification (socle, `Infrastructure/Auth/AuthSetup.cs`)

Cookie ASP.NET Core qui répond 401/403 (jamais de redirection), policy `Admin` = joueur authentifié avec le rôle `admin`, antiforgery enregistré. B1 le complète (`__Host-`, sessions par appareil, rôle lu en base). Tests : `TestAuthHandler` remplace l'authentification par deux en-têtes (`factory.CreateClient(TestUser.Admin)`, `TestUser.Player`) ; le refus reste celui du cookie de l'API.

## Erreurs du front (`POST /api/client-errors`)

`Infrastructure/Errors/ReportClientErrorEndpoint.cs`, même contrat qu'en v1 (`source` `js`/`http`, `message`, `stack`, `url`, `httpStatus`, `relatedTraceId`), appelé par `ErrorReportingService` du front v2 (via `HttpBackend`, hors client généré : `[ExcludeFromDescription]`).

- Public, limité par IP (`[EnableRateLimiting(RateLimitPolicies.ClientErrorReport)]`, 20 / 5 min), bornes du validator reprises de la v1 (message ≤ 1000, pile ≤ 8000, URL ≤ 500, statut 0-599, trace ≤ 64). Réponse 204.
- Journalisé en **Error**, EventId **1100** et message de la v1 (`ClientErrorLog`) : les tableaux de bord existants restent valables. Retours à la ligne neutralisés (pile aplatie avec `|`), **query string et fragment retirés de l'URL côté serveur** même si un client en envoie. Pas encore d'identité du joueur dans le journal : elle viendra du scope posé à partir de B1.
- Tests : `UnitTests/Infrastructure/ReportClientErrorTests` (validation, journal), `IntegrationTests/ClientErrorTests` (204, 400 ProblemDetails, 429 au 21e rapport ; confidentialité : un cookie, un `Authorization` et un jeton dans l'URL n'apparaissent ni dans les traces ni dans les journaux, test v1 `Traces_NeContiennentNiCookieNiAuthorization` repris).

## Staging

Depuis A6, `docker-compose.staging.yml` (racine du dépôt) construit cette API (`InSeconds.Api/Dockerfile`) et le front v2, en `ASPNETCORE_ENVIRONMENT=Staging`, sur la base `inseconds_staging` (schémas v2 à côté des tables v1 de `public`). `deploy/vps/deploy.sh staging` :

1. vérifie le certificat Data Protection (`secrets/dataprotection.pfx` à la racine du checkout du VPS, monté en lecture seule sur `/run/secrets/dataprotection.pfx`) : présent, et lisible par l'utilisateur de l'image (`app`, uid/gid **1654**) ;
2. applique les migrations dans un conteneur jetable (`--migrate-only`), **avant** de remplacer les conteneurs ;
3. redémarre l'API (Wolverine et Hangfire créent leurs schémas à ce moment) et le front ;
4. lance `deploy/vps/smoke-test.sh` sur `https://api-dev.inseconds.cc` : `/api/e2e/reset` et `/api/auth/dev-login` en 404 (S9, sondés en GET : présents, ils répondraient 405 sans rien exécuter), en-têtes de sécurité (S15), `/jobs` en 401/403 ou derrière Cloudflare Access (S3).

**Certificat Data Protection** : monté dès A6, lu par l'API à partir de B1 (`ProtectKeysWithCertificate`, PLAN S16), sous les clés `DataProtection:CertificatePath` (`/run/secrets/dataprotection.pfx`) et `DataProtection:CertificatePassword` (`DATA_PROTECTION_CERTIFICATE_PASSWORD` de `.env.staging`, obligatoire : compose refuse de démarrer sans).

## Ports

API v2 en local : **5175** (`Properties/launchSettings.json`). La base locale est la même que la v1 (5432).

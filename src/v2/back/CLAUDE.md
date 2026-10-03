# CLAUDE.md — back v2 (refonte)

Back de la v2 d'InSeconds, en construction à côté de la v1 (`src/back/`), qui reste en service jusqu'à la bascule. Plan de référence : [`docs/refonte-v2/PLAN.md`](../../../docs/refonte-v2/PLAN.md) et [`docs/refonte-v2/DEVELOPPEMENT.md`](../../../docs/refonte-v2/DEVELOPPEMENT.md). Ce fichier décrit ce qui existe **déjà** dans le code ; il grossit à chaque PR.

État : **PR B1, identité et cookie** (après la phase A : A1 le socle, A2 Wolverine et Hangfire, A3 les services transverses, A6 le staging). Premier module, `Players` : invités, appareils, cookie standard validé en base, reprise des cookies v1, clés Data Protection chiffrées par certificat (cf. « Authentification » et « Module Players »). Pas encore de connexion par lien magique (B2), ni de profil ou d'appareils côté joueur (B3).

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
│       ├── Auth/          # cookie standard, validation de l'appareil, transition v1, Data Protection, policy Admin
│       ├── Messaging/     # Wolverine (HTTP, transactions, outbox)
│       ├── Jobs/          # Hangfire : tâches planifiées, /jobs, GET /api/admin/jobs/{id}
│       └── Hosting/       # ApiComposition, --migrate-only, commandes Wolverine
│   └── Modules/
│       └── Players/       # Domain, Application (endpoints), Contracts, Persistence, PlayersModule.cs
│   └── Internal/Generated/   # code Wolverine généré, COMMITÉ (vérifié en CI)
└── tests/
    ├── InSeconds.UnitTests/
    ├── InSeconds.ArchitectureTests/   # règles de dépendance, horloge, schémas
    └── InSeconds.IntegrationTests/    # Testcontainers postgres:17-alpine + WebApplicationFactory
                                       # (Security/ : SecurityTests, en-têtes, proxies, Data Protection ;
                                       #  Players/ : invités, cookie, transition v1 ; Testing/ : hôte de test)
```

Les modules métier vivent dans `InSeconds.Api/Modules/<Module>/` (le premier : `Players`, B1) ; un module n'utilise des autres que leur dossier `Contracts` (vérifié par `ArchitectureTests/ModuleDependencyTests`, qui s'applique dès qu'un module existe).

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

`Program.cs` appelle `ApiComposition.AddInSecondsApi(args)` puis `UseInSecondsApi()`, partagés avec l'hôte de test. Services : réglages en base → OpenTelemetry → `DbContext` → migrations → calendrier → ProblemDetails → health checks → Data Protection → auth → proxies de confiance → rate limiting → email → Wolverine → Hangfire → modules (`AddPlayers`). Pipeline : `UseForwardedHeaders` (en premier : tout le reste voit l'IP réelle) → en-têtes de sécurité → erreurs → CORS → authentification → transition des cookies v1 → autorisation → rate limiter → routes. Puis `RunJasperFxCommands(args)` (démarre l'API, ou exécute une commande Wolverine comme `codegen write`). Les migrations passent par `DatabaseStartupService` (`IHostedLifecycleService.StartingAsync`) : avant le démarrage de Wolverine et Hangfire, sauf si `Database:MigrateOnStartup=false` ; les réglages sont rechargés juste après (la table peut ne pas avoir existé à la construction de la configuration). Une commande Wolverine ne démarre pas l'hôte : pas de migration, et pas de lecture des réglages en base (`CommandLine.StartsServer`), pour que la CI génère le code sans base.

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
- `POST /api/e2e/reset` : vide (Respawn) les tables de **tous les schémas sauf** `public` (tables v1), `infra`, `extensions`, `messaging` et `jobs`, lus en base à chaque appel (un nouveau module est couvert sans rien changer, `players` depuis B1), et les emails capturés.
- `GET /api/e2e/last-email?to=` : dernier email envoyé à cette adresse (404 sinon).
- À venir : faux Deezer (C1), seed, dev-login (B2), connexion admin de test (avec les premiers E2E admin), `generate-today` (D).
- Tests : `Testing/TestingFactory` (`WebApplicationFactory<TestingProgram>`).

## Authentification (`Infrastructure/Auth/`)

Cookie standard d'ASP.NET Core (§ 5.5 du plan v2), depuis B1.

- **Cookie** (`AuthSetup`) : `__Host-inseconds` (`Secure`, `SameSite=Lax`) en prod et en staging, `inseconds` (`SameSite=Strict`, sans `Secure`) en développement et en test ; `HttpOnly`, persistant, 90 jours glissants. 401/403, jamais de redirection (`PlayerCookieEvents`).
- **Ticket** (`PlayerClaims`) : `player_id` et `device_session_id` seulement. Le rôle admin n'y est ni écrit ni lu : la validation le relit en base et ne l'ajoute qu'au joueur de la requête.
- **Validation à chaque requête** (`PlayerCookieEvents.ValidatePrincipal` → `DeviceSessionValidator`) : appareil existant, non révoqué, joueur non supprimé, rôle admin relu en base. Résultat gardé **une minute** dans un cache dédié (`DeviceSessionStatusCache`, pas l'`IMemoryCache` partagé : piège 24), fraîcheur jugée sur `TimeProvider` : une révocation ou un retrait du rôle s'appliquent en moins d'une minute. Dernière visite (appareil et joueur) notée au plus **toutes les 5 minutes** (R17). Appareil invalide : cookie supprimé, requête anonyme. **Erreur de base : 500, jamais de déconnexion** (piège 37).
- **Joueur courant** : `ICurrentPlayer` (`Modules/Players/Contracts`), lu dans les claims par `ClaimsCurrentPlayer`. Pose du cookie : `IPlayerSignIn` (le joueur est visible dès la suite de la requête).
- **Transition des cookies v1** (`LegacyCookieTransitionMiddleware`, juste après l'authentification) : cookie `authToken` déchiffré avec les paramètres v1 (application `InSeconds`, purpose `InSeconds.Auth.Cookie`, R10), jeton haché (`LegacyToken.HashOf` : SHA-256 du Guid en minuscules avec tirets, en UTF-8, le même calcul que l'import) et cherché dans `players.legacy_tokens` (S6). Trouvé : **une session d'appareil par conversion** (en v1, tous les appareils d'un compte partagent le jeton, R1) et cookie v2. Un même jeton converti depuis moins d'une minute retrouve la session qu'il vient d'ouvrir (`LegacyConversionCache`, conversions d'un même jeton faites l'une après l'autre) : les requêtes parallèles du premier chargement ne créent qu'une session, et un cookie v1 rejoué en boucle n'en crée qu'une par minute ; deux appareils du même compte convertis dans la même minute partagent leur session (rare, sans danger). Tests : `LegacyCookieTests`, `UnitTests/Players/LegacyConversionCacheTests`. L'ancien cookie est toujours supprimé, sauf sur une erreur de base (piège 37). Un cookie v2 valide l'emporte.
- **Data Protection** (`DataProtectionSetup`) : application `InSeconds` (comme en v1), clés dans `infra.data_protection_keys` (même forme que la table v1, copiée à l'import). Chiffrées par le certificat `DataProtection:CertificatePath`/`CertificatePassword` (S16, `ProtectKeysWithCertificate` + `UnprotectKeysWithAnyCertificate`), **exigé quand l'API démarre en prod et en staging** (pas pour `codegen write`). En développement et en test, sans certificat, les clés restent en clair.
- **Policy `Admin`** : joueur authentifié avec le rôle `admin`, posée sur tout `/api/admin` (`WolverineSetup`) et sur `/jobs`. Antiforgery enregistré (actions du tableau de bord Hangfire).
- **Tests** : `TestAuthHandler` simule un joueur par deux en-têtes (`factory.CreateClient(TestUser.Admin)`, `TestUser.Player`) pour les tests d'autorisation des routes ; **sans ces en-têtes, tout passe au vrai cookie** (validation comprise). `TestCertificate` fournit le certificat exigé en staging et en prod (`StagingSettings()`). Tests : `Players/GuestTests`, `Players/CookieValidationTests` (horloge simulée), `Players/LegacyCookieTests`, `Security/DataProtectionTests`, `UnitTests/Players`.

## Module Players (`Modules/Players/`)

Identité, compte, appareils, rôle admin (§ 3.1 du plan v2). Point d'entrée `PlayersModule.AddPlayers()`.

- **Tables** (schéma `players`, migration `PlayersAndDataProtectionKeys`) : `players` (invité = joueur sans compte, suppression logique `deleted_at`), `accounts` (`email` et `pseudo` en `citext` uniques, `is_admin`, `linked_at` vide pour les comptes repris), `device_sessions` (index sur `player_id`), `legacy_tokens` (hash unique), `auth_tokens` (connexion et changement d'email, CHECK par `purpose` : S2). Clés étrangères vers `players`, sans navigation EF.
- **`device_sessions.id` tiré d'une séquence (HiLo, `device_sessions_hilo`) dès l'ajout** : l'identifiant va dans le cookie avant que Wolverine n'enregistre la transaction, sans `SaveChangesAsync` dans le handler.
- **Domaine** (`Domain/`) : `Player.CreateGuest`, `DeviceSession.Open`, `LegacyToken.HashOf` ; `Account` et `AuthToken` ne font que porter leurs colonnes (créés à partir de B2). Constructeurs privés, `private set` (concession EF).
- **Ports** : `IPlayerStore` (écritures, `Domain/`), `IPlayerQueries` (lectures, `Application/`), `IPlayerSessions` (`Contracts/`, pour l'authentification : état d'un appareil, dernière visite, reprise d'un cookie v1 ; ces écritures-là s'enregistrent elles-mêmes, hors handler Wolverine). Implémentations EF publiques (`Persistence/`) : Wolverine construit lui-même les dépendances des endpoints, et refuse une implémentation interne (`InvalidServiceLocationException` au `codegen write`).
- **Endpoints** (`Application/`, Wolverine.Http) :
  - `POST /api/players/guest` : crée un invité et son appareil, pose le cookie ; un navigateur déjà identifié garde son joueur. Rate limit `player-creation` (30 / 10 min par IP, S11).
  - `GET /api/players/me` : lecture seule, **204 sans identité** (`[NoContentIfMissing]`), ne crée jamais de joueur (R7) ; `{ playerId, isGuest, email, pseudo, isAdmin }`.
  - `GET /api/admin/me` : `{ playerId }` pour un admin, 401/403 sinon.

## Erreurs du front (`POST /api/client-errors`)

`Infrastructure/Errors/ReportClientErrorEndpoint.cs`, même contrat qu'en v1 (`source` `js`/`http`, `message`, `stack`, `url`, `httpStatus`, `relatedTraceId`), appelé par `ErrorReportingService` du front v2 (via `HttpBackend`, hors client généré : `[ExcludeFromDescription]`).

- Public, limité par IP (`[EnableRateLimiting(RateLimitPolicies.ClientErrorReport)]`, 20 / 5 min), bornes du validator reprises de la v1 (message ≤ 1000, pile ≤ 8000, URL ≤ 500, statut 0-599, trace ≤ 64). Réponse 204.
- Journalisé en **Error**, EventId **1100** et message de la v1 (`ClientErrorLog`) : les tableaux de bord existants restent valables. Retours à la ligne neutralisés (pile aplatie avec `|`), **query string et fragment retirés de l'URL côté serveur** même si un client en envoie. Pas encore d'identité du joueur dans le journal : la v1 la posait par un scope de journalisation (`PlayerTelemetryMiddleware`), que le plan v2 n'attribue encore à aucune PR.
- Tests : `UnitTests/Infrastructure/ReportClientErrorTests` (validation, journal), `IntegrationTests/ClientErrorTests` (204, 400 ProblemDetails, 429 au 21e rapport ; confidentialité : un cookie, un `Authorization` et un jeton dans l'URL n'apparaissent ni dans les traces ni dans les journaux, test v1 `Traces_NeContiennentNiCookieNiAuthorization` repris).

## Staging

Depuis A6, `docker-compose.staging.yml` (racine du dépôt) construit cette API (`InSeconds.Api/Dockerfile`) et le front v2, en `ASPNETCORE_ENVIRONMENT=Staging`, sur la base `inseconds_staging` (schémas v2 à côté des tables v1 de `public`). `deploy/vps/deploy.sh staging` :

1. vérifie le certificat Data Protection (`secrets/dataprotection.pfx` à la racine du checkout du VPS, monté en lecture seule sur `/run/secrets/dataprotection.pfx`) : présent, et lisible par l'utilisateur de l'image (`app`, uid/gid **1654**) ;
2. applique les migrations dans un conteneur jetable (`--migrate-only`), **avant** de remplacer les conteneurs ;
3. redémarre l'API (Wolverine et Hangfire créent leurs schémas à ce moment) et le front ;
4. lance `deploy/vps/smoke-test.sh` sur `https://api-dev.inseconds.cc` : `/api/e2e/reset` et `/api/auth/dev-login` en 404 (S9, sondés en GET : présents, ils répondraient 405 sans rien exécuter), en-têtes de sécurité (S15), `/jobs` en 401/403 ou derrière Cloudflare Access (S3).

**Certificat Data Protection** : monté dès A6, lu par l'API depuis B1 (`ProtectKeysWithCertificate`, PLAN S16, cf. « Authentification »), sous les clés `DataProtection:CertificatePath` (`/run/secrets/dataprotection.pfx`) et `DataProtection:CertificatePassword` (`DATA_PROTECTION_CERTIFICATE_PASSWORD` de `.env.staging`, obligatoire : compose refuse de démarrer sans).

## Ports

API v2 en local : **5175** (`Properties/launchSettings.json`). La base locale est la même que la v1 (5432).

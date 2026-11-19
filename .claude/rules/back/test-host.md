---
paths:
  - "src/back/InSeconds.Api.Testing/**"
  - "src/back/tests/**"
  - "deploy/vps/*.sql"
  - "deploy/vps/copy-prod-db-to-staging.sh"
  - "deploy/infra/backup*.sh"
---
# Hôte de test, tests et scripts du VPS

Conventions des tests d'intégration (fixture, `ApiFactory`, harnais, noms) : `src/back/CLAUDE.md`. Ici, ce qui est propre à l'hôte de test, aux documents OpenAPI et aux tests des scripts.

## Hôte de test (`InSeconds.Api.Testing`)

- `TestingProgram` : la même composition que l'API, plus les faux et `/api/e2e`. Refuse de démarrer hors `Testing` et `Development`. **Jamais dans l'image de prod** (S9) : l'API ne le référence pas (`ProjectDependencyTests`), le `Dockerfile` ne le copie pas, le job `back-checks` vérifie l'image ; le test de fumée sonde `/api/e2e/reset` et `/api/auth/dev-login` en 404.
- Faux email : `CapturingEmailSender` (en mémoire, `GET /api/e2e/last-email`).
- **Faux Deezer** (`FakeDeezerHandler`) : remplace le **transport HTTP** du vrai client (`ReplaceDeezerHttpHandler`), le vrai client et le vrai cache tournent donc dessus. Conventions par identifiant : à partir de `QuotaFrom` quota dépassé (erreur 4 en HTTP 200), de `NotFoundFrom` inconnu (800), de `NoPreviewFrom` sans extrait ; une recherche contenant `dedup-test` rend des variantes d'un même titre. L'extrait pointe sur le front de test (`E2E_FRONT_PORT`, piège 10). `FakeDeezerState` (singleton) garde les requêtes reçues et un `Intercept` posé par le test (quota, panne, lenteur). Jamais un audio de Deezer : MP3 synthétiques de `Deezer/Fixtures`.
- Réglages commités sans secret (`appsettings.Testing.json`, `appsettings.Development.json`, exception du `.gitignore`) : `App:PublicUrl`, `Auth:TrustedOrigins` (5176 et 5178, piège 22), `Deezer:ResilienceEnabled=false`, `Deezer:PreviewHostSuffix=localhost`, `RateLimiting:Enabled=false` (Testing), et `daily-generate-challenge` **et** `daily-close-day` en pause (un E2E qui tournerait à minuit ne doit pas voir un défi apparaître). La base passe par `ConnectionStrings__DefaultConnection`, jamais par un fichier.
- `POST /api/auth/dev-login` (`Auth/DevLoginEndpoints`) : connexion sans email par `AccountSignIn`, sans contrôle d'origine ; absent de l'API (`DevLoginTests`).

## Routes `/api/e2e` (`E2E/E2EEndpoints.cs`)

`reset`, `reseed`, `seed-catalogue`, `generate-today`, `delete-challenge`, `login-as-admin`, `set-streak`, `runs/settings`, `runs/latest-tracks`, `deezer/without-preview`, `last-email`, `throw`. Points à savoir :

- `reset` (`DatabaseResetter`, Respawn) vide **tous les schémas sauf** `public`, `infra`, `extensions`, `messaging` et `jobs`, lus en base à chaque appel : un nouveau module est couvert sans rien changer. Il remet aussi à zéro les emails capturés, le faux Deezer et son cache, et les réglages `Runs:` posés par un test.
- `seed-catalogue` (`CatalogueSeed`) : 55 morceaux dans un **ordre fixe**, les index comptent (défis d'avant-hier, d'hier et du jour, cooldowns variés, morceaux sans extrait) ; l'usage est écrit en **vrais défis** que le vrai `IDailyTrackUsage` relit. Genres et album notés comme lus : un contrôle nocturne lancé sur ce pool ne les change pas.
- `login-as-admin` : le compte `admin-e2e@e2e.test`, par le chemin du dev-login, puis `is_admin` en base ; la session est neuve, le rôle relu en base.
- `runs/latest-tracks` : les morceaux de la dernière playlist (rien ne les montre avant la réponse, piège 31) pour que les E2E sachent quoi répondre.

## Documents OpenAPI (`ApiDocs/OpenApiDocuments.cs`)

- Un document par module, filtré par préfixes de routes : `players` (`api/players`, `api/admin/accounts`), `catalogue` (`api/catalogue`, `api/admin/catalogue`), `daily` (`api/daily`, `api/admin/daily`, `api/admin/players`), `runs` (`api/runs`, `api/admin/runs`), `social` (`api/social`, `api/admin/social`), `admin` (`api/admin/jobs`, `api/admin/system`). Un nouveau module = un `AddModuleDocument`, une classe fille de `Testing/OpenApiDocumentTests`, un client au front. `Microsoft.AspNetCore.OpenApi` n'est référencé que par l'hôte de test : l'API de prod ne sert aucun document (testé).
- Contrat porté par les endpoints : `OperationId` de l'attribut Wolverine et `[ProducesResponseType<ProblemDetails>]`. Ces attributs ne changent ni le comportement ni le code généré.
- Transformers de l'hôte : un seul tag par module, ni titre ni description déduits, pas de serveur, entiers en `integer`, décimaux en `number` sans le « nombre ou texte » de .NET, propriétés nulles d'un corps facultatives, pas de corps sur les 204, et suppression du 404 sans schéma que Wolverine déclare partout. Un changement de transformer change tous les documents : les régénérer tous.
- Sous Windows, `OpenApi/` et `openapi/` sont le même dossier : le code est dans `ApiDocs/`, les JSON dans `openapi/`.

## Tests d'intégration : à savoir

- `ApiFactory.DisposeAsync` vide les pools Npgsql (piège 11).
- Remplacer un service dans un test (`configureServices`) n'a d'effet que s'il est en service location dans `WolverineSetup` (sinon le code commité le construit en dur).
- Les tâches s'appellent directement (pas de serveur Hangfire), sauf dans `HangfireServerCollection`.
- Horloge : `FakeTimeProvider` remplacé dans les services quand le test joue sur les jours (harnais `GameApi`).
- Usage des morceaux simulé dans les tests du Catalogue par `TestTrackUsage`.

## Scripts du VPS (`InSeconds.MigrationTests`)

- `staging-anonymize.sql` (S8), lancé par `copy-prod-db-to-staging.sh` après la copie des schémas des modules et les migrations : adresses et pseudos des comptes remplacés et rôle admin retiré (sauf pour `STAGING_KEEP_EMAIL`, qui ne vaut que pour `players.accounts`), `players.guest_pseudo` vidé, noms et codes des groupes remplacés, `social.ranking_identity`, jetons, appareils, `legacy_tokens`, clés Data Protection, file de Wolverine et `infra.backup_runs` vidés. Puis `--rotate-data-protection-key`. **Une nouvelle colonne ou table qui porte une donnée personnelle doit y être traitée** (`StagingAnonymizeTests`).
- Fixture `ScriptDatabase` : une base neuve et migrée par test, scripts copiés en LF dans le conteneur et lancés par `psql`, connexions sans réserve (`Pooling = false`).
- `BackupScriptsTests` lance pour de vrai `backup.sh` et `backup-verify.sh` (bash et Docker) contre un faux R2 (`rclone serve s3`) et un faux healthchecks.io / Grafana ; les surcharges `BACKUP_DB_HOST` / `BACKUP_DOCKER_NETWORK` ne servent qu'à ces tests.

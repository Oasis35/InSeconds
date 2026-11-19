---
name: nouvel-endpoint
description: Ajouter ou modifier un endpoint HTTP de l'API InSeconds de bout en bout (back Wolverine.Http, codes d'erreur, persistance, tests, document OpenAPI, client NSwag et traductions du front). À utiliser dès qu'une route /api/... est créée, renommée, ou que son corps, ses réponses ou ses erreurs changent.
argument-hint: <Module> <Cas> (ex. Social RenameGroup)
---

# Nouvel endpoint

Argument : `$ARGUMENTS` (le module et le nom du cas d'usage). Modèle à imiter : `src/back/InSeconds.Api/Modules/Social/Application/GroupEndpoints.cs` (`CreateGroupEndpoint`).

## 1. L'endpoint (back)

Fichier `src/back/InSeconds.Api/Modules/<Module>/Application/<Cas>.cs` (ou à côté des endpoints voisins du même sujet).

- Une classe statique `<Cas>Endpoint`, en étapes :
  - `LoadAsync(...)` : lit ce qu'il faut (ports `I…Queries` / store du module), rend un record ;
  - `Validate(...)` : rend `ProblemDetails` (`WolverineContinue.NoProblems` si tout va bien), règles métier seulement ;
  - `Post` / `Get` / `Put` / `Delete` : l'action. Le record chargé arrive par `[NotBody]`.
- La validation de forme du corps passe par un `AbstractValidator<TRequête>` FluentValidation (ex. `RenameTrackValidator` dans `Catalogue/Application/RenameTrack.cs`).
- Attributs sur la méthode d'action :
  - `[WolverinePost("/api/<module>/...", OperationId = "verbeNom")]` : l'`OperationId` devient le nom de la méthode du client NSwag, ne pas le changer ensuite ;
  - `[Authorize]` si un joueur est requis (toute route `/api/admin*` reçoit la policy Admin d'office) ;
  - `[EnableRateLimiting(RateLimitPolicies.<Politique>)]` pour une écriture (`InSeconds.Infrastructure/RateLimiting/RateLimitPolicies.cs`) ;
  - un `[ProducesResponseType<ProblemDetails>(StatusCodes.Status4xx…)]` par erreur possible (401, 403, 404, 409, 429…).
- Règles dures : jamais de `SaveChangesAsync` (transaction Wolverine), jamais d'`IResult` (`[EmptyResponse]` pour un 204), jamais `DateTime.UtcNow` (`TimeProvider`), un module n'utilise des autres que leur `Contracts/`.
- Rien qui identifie un morceau avant la réponse (piège 31), rien de personnel dans les journaux (`<Module>Log`, `[LoggerMessage]`).

## 2. Codes d'erreur

- Code stable `module.raison` dans `<Module>ErrorCodes` (ex. `SocialErrorCodes` de `Social/Application/SocialSupport.cs`), ProblemDetails fabriqué par `<Module>Problems` (`ApiProblem.Of(statut, code, message)`).
- Ne jamais renommer un code publié : le front le traduit.

## 3. Persistance (si besoin)

- Port nommé par l'intention (`I<Module>Store` pour écrire, `I<Module>Queries` pour lire), enregistré dans `<Module>Module.cs`. Pas de repository générique.
- Nouvelle table ou colonne : skill `migration-ef`.
- **Table avec `player_id`** : l'ajouter au contributeur RGPD du module (`IPlayerDataContributor` : `ExportAsync` et `DeleteAsync`, ex. `SocialPlayerData`), sinon `Players/PlayerDataTests` échoue (piège 48). Lancer ensuite le sous-agent `gardien-rgpd`.

## 4. Code Wolverine (avant les tests)

Depuis `src/back` :

```bash
rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write
```

Les tests relisent ce code commité : sans régénération, ils tournent sur l'ancien.

## 5. Tests

- Test d'intégration dans `src/back/tests/InSeconds.IntegrationTests/<Module>/` : classe `(PostgresFixture postgres) : IAsyncLifetime`, une base neuve par classe (`await postgres.CreateDatabaseAsync()`), l'API par `ApiFactory` (ou `GameApi.CreateAsync(...)` pour avoir des joueurs, cf. `Social/SocialGroupTests.cs`). `Assert` de xUnit seulement.
- Couvrir le cas nominal, chaque code d'erreur, le 401 / 403. Une route admin est vérifiée d'office par `Security/SecurityTests`.
- Lancer : `dotnet test --solution InSeconds.slnx` depuis `src/back` (Docker requis).

## 6. Document OpenAPI et client du front

1. Régénérer le document du module, `src/back/InSeconds.Api.Testing/openapi/<module>.json` (le test `Le_document_sauvegarde_pour_le_front_est_a_jour` échoue tant qu'il est périmé) :
   - une base jetable : `docker run -d --name pg -e POSTGRES_PASSWORD=x -p 55434:5432 postgres:17-alpine` ;
   - l'hôte de test, depuis `src/back` : `ASPNETCORE_ENVIRONMENT=Testing ConnectionStrings__DefaultConnection="Host=localhost;Port=55434;Database=openapi;Username=postgres;Password=x" dotnet run --no-launch-profile --project InSeconds.Api.Testing --urls http://localhost:5177` ;
   - enregistrer `GET http://localhost:5177/openapi/<module>.json`, indenté à 2 espaces, dans le fichier du module ; arrêter l'hôte et supprimer le conteneur.
   - Nouveau préfixe de route hors des documents existants : l'ajouter dans `InSeconds.Api.Testing/ApiDocs/OpenApiDocuments.cs` (`AddModuleDocument`).
2. Depuis `src/front/InSeconds.Client` : `npm run generate-api` (réécrit `src/app/api/<module>/api.generated.ts`).
3. Chaque nouveau code d'erreur : une ligne dans `ERROR_MESSAGE_KEYS` (`src/app/core/errors/error-messages.ts`) et la clé `errors.<module>.<raison>` dans `public/i18n/fr.json` **et** `en.json` (un test vérifie les deux).
4. L'appel côté front passe par l'adaptateur du domaine (`data-access/`), seul à importer le client généré (Sheriff : `npm run lint:arch`).

## 7. Commit

Commiter **ensemble** : le code, `Internal/Generated`, le document `openapi/<module>.json`, le client `api.generated.ts`, les traductions. Les jobs CI `back-checks` (code Wolverine) et `api-clients` (client NSwag) échouent sinon. Puis `gardien-code` sur le diff, et la skill `pr-staging`.

---
name: e2e-local
description: Lancer les tests E2E Playwright d'InSeconds en local (hôte de test sur 5177, front sur 5178, base dédiée). À utiliser pour rejouer un spec E2E, vérifier un parcours avant de pousser, ou diagnostiquer un échec du job CI e2e.
argument-hint: [fichier de spec ou filtre -g] (ex. e2e/runs.spec.ts)
---

# E2E en local

Argument facultatif : `$ARGUMENTS` (un fichier de spec, ou `-g "<titre>"`).

## Ports (piège 10)

- En local : hôte de test **5177**, front **5178** (`ng serve --configuration e2e`).
- En CI seulement : 5175 / 5176 (`e2e-ci`). Ne pas mélanger.
- Une API de dev sur 5175 ou un `ng serve` sur 5176 peuvent tourner en même temps.

## Préparer

1. PostgreSQL local : `docker compose up -d database` à la racine (`.env` avec `DB_PASSWORD`).
2. Une base dédiée aux E2E, distincte de celle du dev (le `/api/e2e/reset` la vide). La chaîne passe par une variable, jamais par un fichier du dépôt :

   ```bash
   export E2E_DB_CONNECTION="Host=localhost;Port=5432;Database=inseconds_e2e;Username=inseconds;Password=<DB_PASSWORD>"
   ```

3. Dépendances du front : `npm ci` dans `src/front/InSeconds.Client`, et Chromium de Playwright (`npx playwright install chromium` la première fois).

## Lancer

Depuis `src/front/InSeconds.Client` :

```bash
npm run e2e -- $ARGUMENTS
```

`playwright.config.ts` démarre seul les deux serveurs (ou réutilise ceux qui tournent déjà) :

- `dotnet run --no-launch-profile --project ../../back/InSeconds.Api.Testing/... --urls http://localhost:5177`, avec `ASPNETCORE_ENVIRONMENT=Testing`. **`--no-launch-profile` est obligatoire** (piège 9) : sans lui, `launchSettings.json` impose `Development` ;
- `npx ng serve --configuration e2e --port 5178`.

Autres commandes : `npm run e2e:ui` (mode interactif), `npm run e2e:list` (liste des specs).

## En cas d'échec

- Un hôte de test resté d'un autre lancement (autre base, ancien code) est réutilisé : l'arrêter avant de relancer.
- Après un changement de handler : régénérer le code Wolverine (`rm -rf InSeconds.Api/Internal/Generated && dotnet run --project InSeconds.Api -- codegen write` depuis `src/back`), l'hôte de test le relit.
- Lien magique refusé : le port du front doit être dans `Auth:TrustedOrigins` de l'hôte de test (piège 22).
- Les routes de l'hôte de test (`/api/e2e/reset`, `reseed`, `login-as-admin`...) : `.claude/rules/back/test-host.md`.

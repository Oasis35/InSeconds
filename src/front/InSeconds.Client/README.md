# InSeconds.Client

Front Angular 22 du blind test musical InSeconds. Voir le [README racine](../../../README.md) / [README.fr.md](../../../README.fr.md) pour la présentation générale du projet, et le [CLAUDE.md racine](../../../CLAUDE.md) pour les conventions détaillées.

## Développement

```bash
npm start
```

Ouvre `http://localhost:5173/` (port non standard volontaire — cf. CLAUDE.md racine, évite le conflit avec le 4200). L'app requiert le backend lancé (`docker compose up -d` depuis la racine du repo).

## Build

```bash
npm run build
```

## Tests unitaires (Karma + Jasmine)

```bash
npx ng test --watch=false --browsers=ChromeHeadless
```

## Tests E2E (Playwright)

```bash
npm run e2e       # headless
npm run e2e:ui    # mode UI interactif
```

## Génération du client API (NSwag)

Après tout changement d'endpoint ou de DTO côté backend :

```bash
docker compose up -d   # depuis la racine, backend à jour
npm run generate-api   # runtime .NET 10 obligatoire
npm run build           # vérifier que le build passe
```

`src/app/api/api.generated.ts` est commité — pense à committer le fichier régénéré.

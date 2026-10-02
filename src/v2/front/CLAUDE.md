# CLAUDE.md — front v2 (refonte)

Front de la v2 d'InSeconds, en construction à côté de la v1 (`src/front/`), qui reste en service jusqu'à la bascule. Plan de référence : [`docs/refonte-v2/PLAN.md`](../../../docs/refonte-v2/PLAN.md) (§ 6 pour le front) et [`docs/refonte-v2/DEVELOPPEMENT.md`](../../../docs/refonte-v2/DEVELOPPEMENT.md). Ce fichier décrit ce qui existe **déjà** dans le code ; il grossit à chaque PR.

État : **PR A4, socle front** ; A5 : E2E copiés (désactivés), image nginx. Aucun écran de jeu : toutes les routes des domaines affichent une page d'attente (« La nouvelle version arrive »). Les domaines arrivent avec leurs modules (B5 `account`, D `gameplay`, E `daily`, F `admin`).

## Commandes

```bash
cd src/v2/front/InSeconds.Client
npm ci
npm start                 # http://localhost:5176, /api /health /jobs relayés vers l'API v2 (:5175, proxy.conf.json)
npm run build             # build de prod (service worker compris)
npx ng test --watch=false # Vitest en mode navigateur (Chromium)
npm run lint:arch         # Sheriff + couche domain/ sans Angular
```

- Angular CLI 22.2 exige **Node ≥ 22.22.3** (ou 24.15+). La CI prend le dernier Node 22.
- Chromium déjà installé ailleurs (environnement sans `playwright install`) : `PLAYWRIGHT_CHROMIUM_PATH=/chemin/vers/chromium npx ng test --watch=false`.
- Pas de client NSwag pour l'instant : les clients `api/` arrivent avec le premier module (B1). E2E : cf. § E2E.

## Stack

Même base que la v1 (Angular 22 standalone, **zoneless**, signals, Tailwind v4 + tokens `:root` de la DA dans `styles.scss`, ngx-translate, Vitest navigateur), plus :
- **NgRx SignalStore** (`@ngrx/signals`) pour les stores ;
- **CDK Dialog** (`@angular/cdk`) pour les modales et panneaux bas ;
- **service worker Angular** (`@angular/service-worker`) : PWA et détection de nouvelle version ;
- **Sheriff** (`@softarc/sheriff-core`) pour les frontières entre dossiers.

Angular, CDK, NgRx, ngx-translate, Tailwind, Vitest et Sheriff sont épinglés à une version exacte dans `package.json`, `@angular/*` alignés (piège 15 racine).

## Structure

```
src/v2/front/InSeconds.Client/
├── sheriff.config.ts          # frontières (cf. plus bas)
├── scripts/check-pure-domain.mjs
├── ngsw-config.json           # service worker : fichiers du front seulement, aucun dataGroups (S10)
├── proxy.conf.json            # dev : /api, /health, /jobs → http://localhost:5175
├── public/
│   ├── i18n/{fr,en}.json      # clés rangées par domaine (common, errors, shell, ui, puis daily, account…)
│   ├── manifest.webmanifest + icons/   # installation sur l'écran d'accueil
│   └── robots.txt, sitemap.xml         # routes v2 (/daily, /privacy)
└── src/app/
    ├── app.ts / app.html      # coquille : bandeau DEV, toasts, bandeau de mise à jour, avis d'ancienne adresse, overlay
    ├── app.config.ts          # zoneless, router, HttpClient + intercepteurs, ngx-translate, service worker
    ├── app.routes.ts          # routes, redirections des adresses v1
    ├── core/                  # transverse
    │   ├── errors/            # AppError, table code → message, remontée des erreurs, ErrorHandler global
    │   ├── http/              # intercepteurs : cookie, nouvelle version (410), remontée des 5xx
    │   ├── i18n/              # LanguageService + test de synchronisation FR/EN
    │   ├── session/           # SessionStore (rempli par Players en B1/B5)
    │   ├── store/             # withRequestStatus
    │   ├── storage/           # StoragePort (localStorage sans exception)
    │   ├── version/           # VersionService (SwUpdate)
    │   ├── health/            # HealthService (sonde /health)
    │   └── shell/             # overlay « Service indisponible », avis d'ancienne adresse, bandeau de mise à jour, pages d'attente et 404
    └── ui/                    # kit de la DA, purement visuel
        ├── button/            # <button appButton variant="primary|secondary|danger|ghost">
        ├── modal/             # ModalService (CDK Dialog) : open, openSheet, confirm ; <app-modal-frame>
        ├── toast/             # ToastService + <app-toast-host>
        ├── error-message/     # message + code d'erreur (traceId)
        ├── env-banner/        # bandeau DEV du staging
        └── decor-background/  # grille et scanlines de la DA
```

Les domaines (`gameplay/`, `daily/`, `account/`, `admin/`, plus tard `runs/` et `home/`) auront chacun quatre couches : `domain/` (TypeScript pur), `data-access/` (stores, adaptateurs API), `feature/` (pages routées), `ui/` (présentation).

## Frontières (Sheriff)

`npm run lint:arch` (job CI `front-v2`) fait échouer la CI si :
- `ui` importe autre chose que `ui` ;
- `core` importe un domaine ;
- une autre couche que `data-access` importe `api/` ;
- `gameplay` importe un mode, ou `daily` et `runs` s'importent mutuellement ;
- `domain/` importe Angular, NgRx, RxJS ou ngx-translate (`scripts/check-pure-domain.mjs`, Sheriff ne voit pas les bibliothèques).

Sheriff ne vérifie que les fichiers atteignables depuis `src/main.ts` (routes chargées à la demande comprises). Ajouter un domaine : rien à changer, les dossiers `src/app/<domaine>/<couche>` sont déjà déclarés dans `sheriff.config.ts` ; un nouveau domaine qui peut en importer un autre s'ajoute à `DOMAIN_DEPENDENCIES`.

## Routes

- `/` → `/daily` (tant que le mode Runs n'est pas public).
- Adresses v1 redirigées : `/blindtest` → `/daily`, `/login` → `/account/login`, `/login/verify` → `/account/login/verify`, `/profile` → `/account/profile`, `/profile/confirm-email` → `/account/confirm-email`, `/confidentialite`, `/mentions-legales`, `/legal-notice` → `/privacy`.
- **Toutes les redirections gardent la query string et le fragment** (`redirectKeepingQuery`) : lien magique, confirmation d'email, `from=legacy`. Testé dans `app.routes.spec.ts`.
- `/daily`, `/account/**`, `/admin/**`, `/privacy` : page d'attente, remplacée par chaque domaine. Tout le reste : 404.

## Erreurs

- L'API v2 renvoie un `ProblemDetails` avec `code` (stable, `module.raison`) et `traceId`. `toAppError()` le convertit en `AppError { code, status, traceId }` (corps JSON ou Blob NSwag ; `common.network` sans réponse, `common.unexpected` sans code lisible).
- `ERROR_MESSAGE_KEYS` (`core/errors/error-messages.ts`) est **la seule table** qui traduit un code en clé i18n. Un code inconnu → `errors.common.unknown`, affiché avec le `traceId` (`<app-error-message>`). Un module ajoute ses codes dans cette table et leurs traductions ; `translations.spec.ts` vérifie que chaque clé existe en FR et en EN.
- Remontée des erreurs vers `POST /api/client-errors` reprise de la v1 (`ErrorReportingService`, `GlobalErrorHandler`, intercepteur des 5xx et échecs réseau, jamais de query string). **L'endpoint n'existe pas encore dans le back v2** (prévu avec A6) : les envois échouent en silence d'ici là.

## Stores

`withRequestStatus()` (`core/store/`) : état `idle | pending | fulfilled | { error: AppError }` et `isPending`/`isFulfilled`/`error`. Dans un store : `patchState(store, setPending())`, puis `setFulfilled()` ou `setError(await toAppError(e))`. État protégé (option par défaut de SignalStore) : on ne le modifie que par les méthodes du store. `SessionStore` est le premier exemple.

## PWA et nouvelle version

- `provideServiceWorker('ngsw-worker.js')`, désactivé en dev. `ngsw-config.json` met en cache les fichiers du front (JS, CSS, index, traductions, icônes), jamais l'API (**aucun `dataGroups`**, S10), et exclut `/jobs` des navigations.
- `VersionService` : `VERSION_READY` ou état irrécupérable → bandeau « Nouvelle version disponible, Recharger / Plus tard » (`<app-update-prompt>`), jamais de rechargement d'office ; vérification au retour de l'onglet au premier plan ; le code `common.new_version` (410 des anciennes routes après la bascule) déclenche le même bandeau.
- **Désactiver le service worker chez tous les joueurs** (bug grave) : `safety-worker.js` est copié à la racine du build. Le servir à la place de `ngsw-worker.js` (et `worker-basic.min.js`) — par exemple un `location = /ngsw-worker.js { alias …/safety-worker.js; }` dans nginx — désinscrit le service worker et vide ses caches au prochain passage du joueur.
- Image de prod : `Dockerfile.prod` (nginx, arg `BUILD_CONFIGURATION` `production`/`staging`), `nginx/nginx.conf` + `nginx/security-headers.conf` (en-têtes de sécurité inclus dans chaque `location`). Repris de la v1 (cache immuable des bundles hashés, `no-cache` pour l'index et les traductions, redirection `code.run` → `from=legacy`), plus une `location` regex **déclarée avant celle des `.js`** qui sert `ngsw.json`, `ngsw-worker.js`, `safety-worker.js`, `worker-basic.min.js` et `manifest.webmanifest` en `no-cache` (sinon `ngsw-worker.js` prendrait le cache immuable des bundles). Vérifié par `scripts/check-nginx-headers.sh` (job CI `nginx-headers-v2`) : en-têtes de cache et de sécurité, types MIME, et `ngsw.json` servi sans aucun `dataGroups` (S10). Branchée sur le staging en A6.

## Coquille (`App`)

- `HealthService` sonde `/health` toutes les 5 s ; overlay « Service indisponible » après 3 échecs consécutifs, retiré au premier succès (repris de la v1).
- Avis « l'adresse a changé » (modale ouverte par `ModalService`) quand l'adresse contient `from=legacy` (redirection nginx de l'ancienne adresse `code.run`) ; le paramètre est retiré de l'adresse avant la première navigation.
- Drapeaux E2E repris de la v1 : `window.__disableAnimations` (classe `no-anim`) et `window.__disableHealthPolling`.

## E2E

Les 25 specs Playwright de la v1 sont **copiés tels quels** dans `e2e/` (PR A5), seuls les ports changent : API v2 de test (`InSeconds.Api.Testing`) sur **5175** en CI / **5177** en local, front sur **5176** en CI / **5178** en local (configurations `ng serve` `e2e-ci`/`e2e`, `proxy.e2e*.conf.json`, `environment.e2e.ts`). `serviceWorkers: 'block'` dans `playwright.config.ts` (E12).

- **Désactivés** : `e2e/disabled-specs.json` liste chaque spec avec la PR qui le réactive ; `playwright.config.ts` les passe en `testIgnore`. Réactiver un spec = retirer sa ligne, dans la PR qui livre la fonctionnalité. Liste vide au jalon J4. Tant qu'ils sont tous désactivés, aucun job CI ne lance les E2E v2 (il arrivera avec le premier spec réactivé, B5).
- **Parité v1/v2** (E8) : `scripts/check-e2e-parity.mjs` (racine du repo, job CI `e2e-parity`) compare les listes `playwright test --list` des deux fronts (fichier › describe › titre, sans numéro de ligne ; `E2E_INCLUDE_DISABLED=1` y remet les specs désactivés). Tout écart (test renommé, ajouté ou retiré d'un seul côté) fait échouer la CI, sauf s'il est justifié dans `e2e/parity-exceptions.json` (`onlyInV1` / `onlyInV2`, titre complet → raison). Un correctif v1 qui ajoute un E2E doit donc le recopier ici au merge de `main` dans `env/staging`.

```bash
npm run e2e:list                       # specs actifs
E2E_INCLUDE_DISABLED=1 npm run e2e:list # tous
node ../../../../scripts/check-e2e-parity.mjs   # parité (npm ci fait dans les deux fronts)
```

## SonarCloud

Une grande partie de la v2 reprend du code de la v1 (styles, remontée d'erreurs, composants de la coquille), ce que Sonar compte comme de la duplication sur le nouveau code. Exclusion posée dans l'UI SonarCloud (Administration → Analysis Scope → Duplication Exclusions) : `src/front/**, src/back/**`. **À retirer en I2** (suppression de la v1, ticket #236).

## Conventions

Mêmes que la v1 (cf. CLAUDE.md racine) : couleurs par `var(--…)`, un composant = `.ts` (+ `.html` s'il est long), `OnPush`, écouteurs globaux dans `host: {}`, état exposé en lecture seule, traductions dans chaque composant qui affiche du texte. En plus : modales **uniquement** par `ModalService` (plus de modale maison), boutons par `appButton`.

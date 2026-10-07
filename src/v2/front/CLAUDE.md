# CLAUDE.md — front v2 (refonte)

Front de la v2 d'InSeconds, en construction à côté de la v1 (`src/front/`), qui reste en service jusqu'à la bascule. Plan de référence : [`docs/refonte-v2/PLAN.md`](../../../docs/refonte-v2/PLAN.md) (§ 6 pour le front) et [`docs/refonte-v2/DEVELOPPEMENT.md`](../../../docs/refonte-v2/DEVELOPPEMENT.md). Ce fichier décrit ce qui existe **déjà** dans le code ; il grossit à chaque PR.

État : **PR C3, front du pool admin** (après A4 : socle, A5 : E2E copiés et image nginx, A6 : staging, B5 : compte). Les domaines `account` (connexion, profil, appareils, confirmation d'email) et `admin` (coquille et onglet Pool) existent ; `/daily`, `/privacy` et les autres onglets de l'admin affichent encore une page d'attente (« La nouvelle version arrive »). Les autres domaines arrivent avec leurs modules (D `gameplay`, E `daily`, F `admin` complet).

## Commandes

```bash
cd src/v2/front/InSeconds.Client
npm ci
npm start                 # http://localhost:5176, /api /health /jobs relayés vers l'API v2 (:5175, proxy.conf.json)
npm run build             # build de prod (service worker compris)
npx ng test --watch=false # Vitest en mode navigateur (Chromium)
npm run lint:arch         # Sheriff + couche domain/ sans Angular
npm run generate-api      # régénère les clients NSwag (cf. « Clients de l'API »)
```

- Angular CLI 22.2 exige **Node ≥ 22.22.3** (ou 24.15+). La CI prend le dernier Node 22.
- Chromium déjà installé ailleurs (environnement sans `playwright install`) : `PLAYWRIGHT_CHROMIUM_PATH=/chemin/vers/chromium npx ng test --watch=false`.
- Clients de l'API : cf. § Clients de l'API. E2E : cf. § E2E.

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
├── nswag/{players,catalogue}.nswag.json   # génération des clients NSwag (un fichier par module)
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
    ├── api/{players,catalogue}/   # clients NSwag générés (api.generated.ts), importés seulement par la couche data-access de leur domaine
    ├── account/               # connexion, vérification, profil, appareils, confirmation d'email (cf. § Domaine account)
    ├── admin/                 # coquille de l'admin et pool de morceaux (cf. § Domaine admin)
    ├── core/                  # transverse
    │   ├── errors/            # AppError, table code → message, remontée des erreurs, ErrorHandler global
    │   ├── http/              # intercepteurs : cookie, nouvelle version (410), remontée des 5xx
    │   ├── i18n/              # LanguageService + test de synchronisation FR/EN
    │   ├── session/           # SessionStore (rempli par Players en B1/B5)
    │   ├── store/             # withRequestStatus
    │   ├── storage/           # StoragePort (localStorage sans exception)
    │   ├── version/           # VersionService (SwUpdate)
    │   ├── health/            # HealthService (sonde /health)
    │   └── shell/             # en-tête (avatar), overlay « Service indisponible », avis d'ancienne adresse, bandeau de mise à jour, pages d'attente et 404
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
- `/account/**` : domaine `account` (chargé à la demande). `/admin/**` : domaine `admin` (`/admin` → `/admin/catalogue`, l'ancien `/admin/pool` et `/admin?tab=pool` aussi, page de la grille et autres paramètres gardés). `/daily`, `/privacy` et les onglets de l'admin à venir (`/admin/dashboard`, `defis`, `joueurs`, `actions`) : page d'attente, remplacée par chaque domaine. Tout le reste : 404.

## Erreurs

- L'API v2 renvoie un `ProblemDetails` avec `code` (stable, `module.raison`) et `traceId`. `toAppError()` le convertit en `AppError { code, status, traceId }` (erreur `HttpClient`, `ApiException` ou `ProblemDetails` levés par un client NSwag, corps JSON ou Blob ; `common.network` sans réponse, `common.unexpected` sans code lisible).
- `ERROR_MESSAGE_KEYS` (`core/errors/error-messages.ts`) est **la seule table** qui traduit un code en clé i18n. Un code inconnu → `errors.common.unknown`, affiché avec le `traceId` (`<app-error-message>`). Un module ajoute ses codes dans cette table et leurs traductions ; `translations.spec.ts` vérifie que chaque clé existe en FR et en EN.
- Remontée des erreurs vers `POST /api/client-errors` reprise de la v1 (`ErrorReportingService`, `GlobalErrorHandler`, intercepteur des 5xx et échecs réseau, jamais de query string). Endpoint du back v2 depuis A6 (même contrat, cf. `src/v2/back/CLAUDE.md`).

## Stores

`withRequestStatus()` (`core/store/`) : état `idle | pending | fulfilled | { error: AppError }` et `isPending`/`isFulfilled`/`error`. Dans un store : `patchState(store, setPending())`, puis `setFulfilled()` ou `setError(await toAppError(e))`. État protégé (option par défaut de SignalStore) : on ne le modifie que par les méthodes du store. `SessionStore` (joueur courant : id, pseudo, email, invité ou compte, admin) est rempli par `account`. Piège : un nom d'état ne doit pas être celui d'une méthode du même store (`logout` état et méthode se masquaient) — d'où `…Status` pour les états.

## PWA et nouvelle version

- `provideServiceWorker('ngsw-worker.js')`, désactivé en dev. `ngsw-config.json` met en cache les fichiers du front (JS, CSS, index, traductions, icônes), jamais l'API (**aucun `dataGroups`**, S10), et exclut `/jobs` des navigations.
- `VersionService` : `VERSION_READY` ou état irrécupérable → bandeau « Nouvelle version disponible, Recharger / Plus tard » (`<app-update-prompt>`), jamais de rechargement d'office ; vérification au retour de l'onglet au premier plan ; le code `common.new_version` (410 des anciennes routes après la bascule) déclenche le même bandeau.
- **Désactiver le service worker chez tous les joueurs** (bug grave) : `safety-worker.js` est copié à la racine du build. Le servir à la place de `ngsw-worker.js` (et `worker-basic.min.js`) — par exemple un `location = /ngsw-worker.js { alias …/safety-worker.js; }` dans nginx — désinscrit le service worker et vide ses caches au prochain passage du joueur.
- Image de prod : `Dockerfile.prod` (nginx, arg `BUILD_CONFIGURATION` `production`/`staging`), `nginx/nginx.conf` + `nginx/security-headers.conf` (en-têtes de sécurité inclus dans chaque `location`). Repris de la v1 (cache immuable des bundles hashés, `no-cache` pour l'index et les traductions, redirection `code.run` → `from=legacy`), plus une `location` regex **déclarée avant celle des `.js`** qui sert `ngsw.json`, `ngsw-worker.js`, `safety-worker.js`, `worker-basic.min.js` et `manifest.webmanifest` en `no-cache` (sinon `ngsw-worker.js` prendrait le cache immuable des bundles). Vérifié par `scripts/check-nginx-headers.sh` (job CI `nginx-headers-v2`) : en-têtes de cache et de sécurité, types MIME, `ngsw.json` servi sans aucun `dataGroups` (S10), et redirection de l'ancienne adresse `code.run` (301 vers `https://inseconds.cc`, chemin et query gardés, `from=legacy` ajouté), que les E2E ne voient pas (ils tournent sur `ng serve`, sans nginx). Servie sur le staging depuis A6 (`docker-compose.staging.yml`, configuration `staging` : API `https://api-dev.inseconds.cc`, appelée avec CORS et cookie).

## Coquille (`App`)

- `HealthService` sonde `/health` toutes les 5 s ; overlay « Service indisponible » après 3 échecs consécutifs, retiré au premier succès (repris de la v1).
- Avis « l'adresse a changé » (modale ouverte par `ModalService`) quand l'adresse contient `from=legacy` (redirection nginx de l'ancienne adresse `code.run`) ; le paramètre est retiré de l'adresse avant la première navigation.
- Drapeaux E2E repris de la v1 : `window.__disableAnimations` (classe `no-anim`) et `window.__disableHealthPolling`.

## E2E

Les 25 specs Playwright de la v1 sont **copiés tels quels** dans `e2e/` (PR A5). Seuls changent les ports, et les boucles d'étapes séquentielles des fixtures et page objects, réécrites avec `inSequence`/`times` (`e2e/fixtures/sequence.ts`, Sonar S9382 : pas d'`await` dans une boucle, mêmes étapes dans le même ordre). Ports : API v2 de test (`InSeconds.Api.Testing`) sur **5175** en CI / **5177** en local, front sur **5176** en CI / **5178** en local (configurations `ng serve` `e2e-ci`/`e2e`, `proxy.e2e*.conf.json`, `environment.e2e.ts`). `serviceWorkers: 'block'` dans `playwright.config.ts` (E12). En local, `playwright.config.ts` démarre l'hôte de test et `ng serve` ; la base E2E se passe par `E2E_DB_CONNECTION` (chaîne de connexion complète, jamais commitée — Sonar S2068).

- **Désactivés** : `e2e/disabled-specs.json` liste chaque spec avec la PR qui le réactive ; `playwright.config.ts` les passe en `testIgnore`. Réactiver un spec = retirer sa ligne, dans la PR qui livre la fonctionnalité. Liste vide au jalon J4. Depuis B5 (jalon J2), `login`, `profile` et `change-email` sont actifs et le job CI `e2e-v2` les lance (hôte de test sur 5175, `ng serve --configuration e2e-ci` sur 5176). Les corps des specs réactivés sont adaptés à la v2 (l'écran d'accueil du jeu n'existe pas avant E5 : la connexion se vérifie par l'avatar de l'en-tête, `expectSignedIn` du page object) ; **les titres restent ceux de la v1** (contrôle de parité) et tout écart de scénario est justifié dans `DEVELOPPEMENT.md`. L'hôte de test se lance avec `--no-launch-profile` (sinon `launchSettings.json` impose `Development`). La fixture `api-client.ts` lit les liens dans le dernier email capturé (`/api/e2e/last-email`) et attend un lien différent du précédent : l'email part de l'outbox, après la réponse 204.
- **`admin.spec.ts` réactivé en C3, en partie** : un fichier se réactive entier (`testIgnore`), alors que ses tests dépendent de PR différentes. Les tests du pool, de l'accès à l'admin et de l'ID navigateur sont actifs ; ceux qui attendent un onglet de F2 (dashboard, défis, actions, joueurs, compteurs d'onglets) ou le jeu (E5) sont en **`test.fixme`**, avec leur **titre inchangé** (la parité les liste). **La PR qui livre l'onglet retire le `fixme` de ses tests** (et adapte leurs URL : le pool est `/admin/catalogue`) ; `apiGetPoolUnlockDate` d'`admin.page.ts` (ancienne route `/api/admin/tracks`) sera à réécrire pour `/api/admin/catalogue/tracks` en F2. Le critère « liste des E2E désactivés vide » (J4) ne voit pas les `fixme` : chercher `test.fixme` avant de le déclarer atteint. L'admin se connecte par `POST /api/e2e/login-as-admin`, les données viennent de `POST /api/e2e/reseed` (cf. `src/v2/back/CLAUDE.md`, « Hôte de test »). L'extrait du faux Deezer est `/test-audio.mp3`, servi par le front (`public/`).
- **Parité v1/v2** (E8) : `scripts/check-e2e-parity.mjs` (racine du repo, job CI `e2e-parity`) compare les listes `playwright test --list` des deux fronts (fichier › describe › titre, sans numéro de ligne ; `E2E_INCLUDE_DISABLED=1` y remet les specs désactivés). Tout écart (test renommé, ajouté ou retiré d'un seul côté) fait échouer la CI, sauf s'il est justifié dans `e2e/parity-exceptions.json` (`onlyInV1` / `onlyInV2`, titre complet → raison). Un correctif v1 qui ajoute un E2E doit donc le recopier ici au merge de `main` dans `env/staging`.

```bash
npm run e2e:list                       # specs actifs
E2E_INCLUDE_DISABLED=1 npm run e2e:list # tous
node ../../../../scripts/check-e2e-parity.mjs   # parité (npm ci fait dans les deux fronts)
```

## Clients de l'API (NSwag)

Un client par module (§ 6.1 du plan), dans `src/app/api/<module>/api.generated.ts` (**fichier généré, commité**, exclu de Sonar sous ce nom). Il est généré depuis le document OpenAPI du module, servi **par l'hôte de test seulement** (`/openapi/<module>.json`) et sauvegardé dans `src/v2/back/InSeconds.Api.Testing/openapi/<module>.json` (cf. `src/v2/back/CLAUDE.md`) :

```bash
cd src/v2/front/InSeconds.Client
npm run generate-api      # lit le document sauvegardé ; nswag/<module>.nswag.json fixe la sortie
```

Après tout changement d'endpoint d'un module : régénérer le document côté back (cf. `src/v2/back/CLAUDE.md`), puis le client ici, et commiter les deux. Un nouveau module ajoute son `nswag/<module>.nswag.json` (nom du jeton `<MODULE>_API_BASE_URL`, `SingleClientFromOperationId`) et sa ligne dans le script `generate-api`. Le client n'est utilisé que par l'adaptateur de la couche `data-access` du domaine (`PlayersApi`), qui rend des types du domaine : le JSON livre les dates en texte alors que le client les annonce en `Date`, l'adaptateur les convertit ; un `204` (`GET /api/players/me` sans identité) est levé par le client comme une erreur, l'adaptateur le traduit en `null`.

## Domaine account

`src/app/account/`, quatre couches (frontières vérifiées par Sheriff) :
- `domain/` (TypeScript pur) : règles du pseudo (mêmes bornes et caractères que le back), adresse plausible, `Device`, et la machine à états de la vérification du lien (`verify-flow`) ;
- `data-access/` : `PlayersApi` (adaptateur du client), `SessionLoader` (lit l'identité une seule fois au démarrage, la relit à la demande — seule la lecture la plus récente écrit dans la session —, crée l'invité si besoin), stores `LoginStore`, `VerifyStore` (enveloppe la machine à états), `ConfirmEmailStore`, `ProfileStore`, `DevicesStore` ; `players.providers.ts` donne l'adresse de l'API au client ;
- `feature/` : pages `login`, `verify`, `confirm-email`, `profile`, routes `ACCOUNT_ROUTES` (chargées à la demande, chaque page fournit ses stores), `linkedAccountGuard` (compte requis, attend la lecture de l'identité), `provideAccount()` (branché dans `app.config.ts` : adresse de l'API et lecture de l'identité au démarrage, sans bloquer l'affichage), `BrowserIdComponent` ;
- `ui/` : `auth-page` (cadre des écrans d'authentification), `device-list`, `browser-id-view`.

Règles : le lien magique et le lien de changement d'email ne se consomment **jamais** à l'ouverture de la page (piège 21), seulement au clic sur « Confirmer » ; un navigateur déjà connecté est prévenu avant de confirmer le lien d'une autre adresse (piège 30). Les aides de test (`**/testing/**`, faux `PlayersApi`, `dom.ts`) sont exclues du build de l'app.

## Domaine admin

`src/app/admin/`, quatre couches. Depuis C3 : la coquille et l'onglet **Pool** (`/admin/catalogue`) ; dashboard, défis, joueurs et actions arrivent en F2 (le domaine `admin` peut importer `account`, pour `BrowserIdComponent`).
- `domain/` (TypeScript pur) : `PoolTrack` (disponible ou utilisé se déduit de `usageCount`), filtres (texte cherché dans l'artiste, le titre **et « artiste titre » collés**, piège 28 ; statut, extrait, plage de dernière utilisation), tri (**par défaut les disponibles avant les utilisés**, comme en v1 ; désactivés toujours en fin ; valeurs vides en dernier), pagination par 15, autonomie du pool en jours (`DEFAULT_TRACKS_PER_CHALLENGE` = 5 en attendant que le réglage vienne de l'API, F2/E) ;
- `data-access/` : `CatalogueApi` (adaptateur du client, rend des types du domaine ; `findPreviewUrl` redemande l'extrait à Deezer, le pool n'en garde pas l'adresse signée), `PoolStore` (liste, filtres, tri, page, sélection, ajout, renommage, désactivation, suppression : **aucune mutation locale**, la liste est relue après chaque action ; les actions rendent l'erreur à afficher dans leur fenêtre ou `null`), `DeezerSearchStore` (panneau : attente de 300 ms, recherche annulée par la suivante, ajout par ligne, liaison avec le filtre), `AudioPreviewPlayer` (un seul son à la fois, aucun audio gardé, piège 47) ; `catalogue.providers.ts` donne l'adresse de l'API au client ;
- `feature/` : `AdminShellPage` (accès : visiteur ou invité → « Connecte-toi d'abord » ; compte sans le rôle → « Accès refusé » ; admin → onglets et déconnexion ; l'ID navigateur est affiché dans tous les cas), `CataloguePage` (fournit `PoolStore`, `DeezerSearchStore` et `AudioPreviewPlayer`, câble la liaison filtre ↔ recherche, reprend et écrit `?page=` — numérotée à partir de 1, `replaceUrl` —, ouvre les fenêtres), fenêtres `PreviewTrackDialog`, `EditTrackDialog` (renommer est permis **à tout moment, défi du jour compris**, avec un avertissement dans ce cas), `DeleteTrackDialog`, `ADMIN_ROUTES`, `provideAdmin()` (branché dans `app.config.ts`) ;
- `ui/` : `PoolToolbar`, `PoolFilterBar`, `PoolTable` (pagination comprise), `SearchPanel`, purement présentationnels.

Règles : les fenêtres du pool s'ouvrent avec **`injector: inject(Injector)`** (option de `ModalService`) : sans elle, le CDK Dialog ne voit que la racine et ne trouverait pas `PoolStore`. Fermer la fenêtre d'écoute arrête le son et une réponse de Deezer arrivée après la fermeture ne relance rien (piège 42, testé). Un morceau utilisé ne se supprime pas (le bouton « Désactiver » le remplace) ; un morceau du défi du jour ne se désactive pas (bouton grisé). Les accès à l'admin sont revérifiés par l'API à chaque requête : l'écran d'accès n'est qu'un confort. Une page de l'admin prend toute la largeur (`host: { class: 'flex w-full min-w-0 justify-center' }`) : centrée par la coquille (`items-center`), elle prendrait sinon la largeur du tableau et déborderait de l'écran d'un téléphone au lieu de faire défiler le tableau seul.

## SonarCloud

Une grande partie de la v2 reprend du code de la v1 (styles, remontée d'erreurs, composants de la coquille), ce que Sonar compte comme de la duplication sur le nouveau code. Exclusion posée dans l'UI SonarCloud (Administration → Analysis Scope → Duplication Exclusions) : `src/front/**, src/back/**`. **À retirer en I2** (suppression de la v1, ticket #236).

## Conventions

Mêmes que la v1 (cf. CLAUDE.md racine) : couleurs par `var(--…)`, un composant = `.ts` (+ `.html` s'il est long), `OnPush`, écouteurs globaux dans `host: {}`, état exposé en lecture seule, traductions dans chaque composant qui affiche du texte. En plus : modales **uniquement** par `ModalService` (plus de modale maison ; `injector` pour qu'une fenêtre retrouve les stores de sa page), boutons par `appButton`.

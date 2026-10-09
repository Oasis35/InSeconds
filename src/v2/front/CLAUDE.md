# CLAUDE.md — front v2 (refonte)

Front de la v2 d'InSeconds, en construction à côté de la v1 (`src/front/`), qui reste en service jusqu'à la bascule. Plan de référence : [`docs/refonte-v2/PLAN.md`](../../../docs/refonte-v2/PLAN.md) (§ 6 pour le front) et [`docs/refonte-v2/DEVELOPPEMENT.md`](../../../docs/refonte-v2/DEVELOPPEMENT.md). Ce fichier décrit ce qui existe **déjà** dans le code ; il grossit à chaque PR.

État : **PR E5, front du jeu du jour** (après A4 : socle, A5 : E2E copiés et image nginx, A6 : staging, B5 : compte, C3 : pool admin, D2 : manche). Les domaines `account` (connexion, profil, appareils, confirmation d'email), `admin` (coquille et onglet Pool), `gameplay` (la manche d'un morceau) et `daily` (le jeu du jour : accueil, reprise, manche, récap, « déjà joué », série et gels) existent ; `/privacy` est la page de confidentialité et mentions légales. Les autres onglets de l'admin affichent une page d'attente jusqu'à F2.

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
- **Howler.js** (`howler`, version figée) pour le son de la manche, en Web Audio (cf. § Domaine gameplay) ;
- **service worker Angular** (`@angular/service-worker`) : PWA et détection de nouvelle version ;
- **Sheriff** (`@softarc/sheriff-core`) pour les frontières entre dossiers.

Angular, CDK, NgRx, ngx-translate, Tailwind, Vitest et Sheriff sont épinglés à une version exacte dans `package.json`, `@angular/*` alignés (piège 15 racine).

## Structure

```
src/v2/front/InSeconds.Client/
├── sheriff.config.ts          # frontières (cf. plus bas)
├── scripts/check-pure-domain.mjs
├── nswag/{players,catalogue,daily}.nswag.json   # génération des clients NSwag (un fichier par module)
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
    ├── api/{players,catalogue,daily}/   # clients NSwag générés (api.generated.ts), importés seulement par la couche data-access de leur domaine
    ├── account/               # connexion, vérification, profil, appareils, confirmation d'email (cf. § Domaine account)
    ├── daily/                 # le jeu du jour : partie, série et gels, statistiques, partage (cf. § Domaine daily)
    ├── gameplay/              # la manche d'un morceau : machine à états, lecteur Howler, saisie, révélation (cf. § Domaine gameplay)
    ├── admin/                 # coquille de l'admin et pool de morceaux (cf. § Domaine admin)
    ├── core/                  # transverse
    │   ├── errors/            # AppError, table code → message, remontée des erreurs, ErrorHandler global
    │   ├── http/              # intercepteurs : cookie, nouvelle version (410), remontée des 5xx
    │   ├── i18n/              # LanguageService + test de synchronisation FR/EN
    │   ├── session/           # SessionStore (rempli par Players en B1/B5)
    │   ├── store/             # withRequestStatus
    │   ├── clipboard/         # ClipboardService (copie, repli execCommand, piège 45)
    │   ├── storage/           # StoragePort (localStorage sans exception)
    │   ├── version/           # VersionService (SwUpdate)
    │   ├── health/            # HealthService (sonde /health)
    │   └── shell/             # en-tête (avatar), overlay « Service indisponible », avis d'ancienne adresse, bandeau de mise à jour, emplacement de gauche (`HeaderSlot`), page de confidentialité, pages d'attente de l'admin et 404
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

Sheriff ne vérifie que les fichiers atteignables depuis `src/main.ts` (routes chargées à la demande comprises) : tous les domaines étant routés depuis E5, `npm run lint:arch` n'a plus besoin d'entrées supplémentaires. Ajouter un domaine : rien à changer, les dossiers `src/app/<domaine>/<couche>` sont déjà déclarés dans `sheriff.config.ts` ; un nouveau domaine qui peut en importer un autre s'ajoute à `DOMAIN_DEPENDENCIES` (`daily` : `gameplay` et `account`, ce dernier pour `SessionLoader`, qui crée l'invité avant la première partie). Une couche `feature/` n'importe ni `api/` ni `environment/` : l'adresse de l'API passe par la couche `data-access` (`provideDailyApi`).

## Routes

- `/` → `/daily` (tant que le mode Runs n'est pas public).
- Adresses v1 redirigées : `/blindtest` → `/daily`, `/login` → `/account/login`, `/login/verify` → `/account/login/verify`, `/profile` → `/account/profile`, `/profile/confirm-email` → `/account/confirm-email`, `/confidentialite`, `/mentions-legales`, `/legal-notice` → `/privacy`.
- **Toutes les redirections gardent la query string et le fragment** (`redirectKeepingQuery`) : lien magique, confirmation d'email, `from=legacy`. Testé dans `app.routes.spec.ts`.
- `/account/**` : domaine `account` (chargé à la demande). `/admin/**` : domaine `admin` (`/admin` → `/admin/catalogue`, l'ancien `/admin/pool` et `/admin?tab=pool` aussi, page de la grille et autres paramètres gardés), avec une page d'attente pour les onglets de F2 (`/admin/dashboard`, `defis`, `joueurs`, `actions`). `/daily` : domaine `daily` (`DAILY_ROUTES`, avec `provideGameplay()` : Howler ne se charge qu'avec cette route). `/privacy` : page de confidentialité (`core/shell/privacy`, repris de la v1). Tout le reste : 404.

## Erreurs

- L'API v2 renvoie un `ProblemDetails` avec `code` (stable, `module.raison`) et `traceId`. `toAppError()` le convertit en `AppError { code, status, traceId }` (erreur `HttpClient`, `ApiException` ou `ProblemDetails` levés par un client NSwag, corps JSON ou Blob ; `common.network` sans réponse, `common.unexpected` sans code lisible).
- `ERROR_MESSAGE_KEYS` (`core/errors/error-messages.ts`) est **la seule table** qui traduit un code en clé i18n. Un code inconnu → `errors.common.unknown`, affiché avec le `traceId` (`<app-error-message>`). Un module ajoute ses codes dans cette table et leurs traductions ; `translations.spec.ts` vérifie que chaque clé existe en FR et en EN.
- Remontée des erreurs vers `POST /api/client-errors` reprise de la v1 (`ErrorReportingService`, `GlobalErrorHandler`, intercepteur des 5xx et échecs réseau, jamais de query string). Endpoint du back v2 depuis A6 (même contrat, cf. `src/v2/back/CLAUDE.md`).

## Stores

`withRequestStatus()` (`core/store/`) : état `idle | pending | fulfilled | { error: AppError }` et `isPending`/`isFulfilled`/`error`. Dans un store : `patchState(store, setPending())`, puis `setFulfilled()` ou `setError(await toAppError(e))`. État protégé (option par défaut de SignalStore) : on ne le modifie que par les méthodes du store. `SessionStore` (joueur courant : id, pseudo, email, invité ou compte, admin) est rempli par `account`. Piège : un nom d'état ne doit pas être celui d'une méthode du même store (`logout` état et méthode se masquaient) — d'où `…Status` pour les états.

## PWA et nouvelle version

- `provideServiceWorker('ngsw-worker.js')`, désactivé en dev. `ngsw-config.json` met en cache les fichiers du front (JS, CSS, index, traductions, icônes), jamais l'API (**aucun `dataGroups`**, S10), et exclut `/jobs` des navigations.
- `VersionService` : `VERSION_READY` ou état irrécupérable → bandeau « Nouvelle version disponible, Recharger / Plus tard » (`<app-update-prompt>`), jamais de rechargement d'office ; vérification au démarrage (sans elle, le bandeau n'arrivait qu'environ 25 s après l'ouverture, le service worker attendant un moment sans requête pour vérifier) et au retour de l'onglet au premier plan ; le code `common.new_version` (410 des anciennes routes après la bascule) déclenche le même bandeau.
- **Désactiver le service worker chez tous les joueurs** (bug grave) : `safety-worker.js` est copié à la racine du build. Le servir à la place de `ngsw-worker.js` (et `worker-basic.min.js`) — par exemple un `location = /ngsw-worker.js { alias …/safety-worker.js; }` dans nginx — désinscrit le service worker et vide ses caches au prochain passage du joueur.
- Image de prod : `Dockerfile.prod` (nginx, arg `BUILD_CONFIGURATION` `production`/`staging`), `nginx/nginx.conf` + `nginx/security-headers.conf` (en-têtes de sécurité inclus dans chaque `location`). Repris de la v1 (cache immuable des bundles hashés, `no-cache` pour l'index et les traductions, redirection `code.run` → `from=legacy`), plus une `location` regex **déclarée avant celle des `.js`** qui sert `ngsw.json`, `ngsw-worker.js`, `safety-worker.js`, `worker-basic.min.js` et `manifest.webmanifest` en `no-cache` (sinon `ngsw-worker.js` prendrait le cache immuable des bundles). Vérifié par `scripts/check-nginx-headers.sh` (job CI `nginx-headers-v2`) : en-têtes de cache et de sécurité, types MIME, `ngsw.json` servi sans aucun `dataGroups` (S10), et redirection de l'ancienne adresse `code.run` (301 vers `https://inseconds.cc`, chemin et query gardés, `from=legacy` ajouté), que les E2E ne voient pas (ils tournent sur `ng serve`, sans nginx). Servie sur le staging depuis A6 (`docker-compose.staging.yml`, configuration `staging` : API `https://api-dev.inseconds.cc`, appelée avec CORS et cookie).

## Coquille (`App`)

- `HealthService` sonde `/health` toutes les 5 s ; overlay « Service indisponible » après 3 échecs consécutifs, retiré au premier succès (repris de la v1).
- Avis « l'adresse a changé » (modale ouverte par `ModalService`) quand l'adresse contient `from=legacy` (redirection nginx de l'ancienne adresse `code.run`) ; le paramètre est retiré de l'adresse avant la première navigation.
- Drapeaux E2E repris de la v1 : `window.__disableAnimations` (classe `no-anim`) et `window.__disableHealthPolling`.

## E2E

Les 25 specs Playwright de la v1 sont **copiés tels quels** dans `e2e/` (PR A5). Seuls changent les ports, et les boucles d'étapes séquentielles des fixtures et page objects, réécrites avec `inSequence`/`times` (`e2e/fixtures/sequence.ts`, Sonar S9382 : pas d'`await` dans une boucle, mêmes étapes dans le même ordre). Ports : API v2 de test (`InSeconds.Api.Testing`) sur **5175** en CI / **5177** en local, front sur **5176** en CI / **5178** en local (configurations `ng serve` `e2e-ci`/`e2e`, `proxy.e2e*.conf.json`, `environment.e2e.ts`). `serviceWorkers: 'block'` dans `playwright.config.ts` (E12). En local, `playwright.config.ts` démarre l'hôte de test et `ng serve` ; la base E2E se passe par `E2E_DB_CONNECTION` (chaîne de connexion complète, jamais commitée — Sonar S2068).

- **Désactivés** : `e2e/disabled-specs.json` liste chaque spec avec la PR qui le réactive ; `playwright.config.ts` les passe en `testIgnore`. Réactiver un spec = retirer sa ligne, dans la PR qui livre la fonctionnalité. Liste vide au jalon J4 (il ne reste que `error-reporting.spec.ts`). Depuis B5 (jalon J2) `login`, `profile` et `change-email` sont actifs ; **depuis E5 (jalon J3) tous les E2E du jeu le sont**, et le job CI `e2e-v2` les lance (hôte de test sur 5175, `ng serve --configuration e2e-ci` sur 5176). Les corps des specs sont adaptés à la v2 ; **les titres restent ceux de la v1** (contrôle de parité) et tout écart de scénario est justifié dans `DEVELOPPEMENT.md`. Adaptations de E5 : les routes (`/api/daily/…`, `/daily`, `/account/login`) ; `api.reset()` **re-sème le pool** (en v1, « reset » ne vidait que les parties : l'hôte de test v2 vide tout, d'où `reseed`), sauf `reset({ emptyPool: true })` (tout vidé : aucun défi possible) et `reset({ deleteChallenge: true })` (le défi du jour seul est retiré, `POST /api/e2e/delete-challenge`) ; les parties de l'API se jouent par position (`startGame`, `submitEmptyAnswers`) ; la suite d'un palier se lit au chrono du lecteur (`data-testid="round-timer"` : « … » au chargement, « 0.0s / 0.5s » en lecture, « 0.5s / 0.5s » palier joué) plutôt qu'à une attente fixe ; les suggestions sont des `role="option"`. **L'extrait du faux Deezer pointe sur le front de test** (`E2E_FRONT_PORT`, 5176 par défaut = CI ; `playwright.config.ts` pose 5178 en local) : sans lui, le son ne se charge pas. L'hôte de test se lance avec `--no-launch-profile` (sinon `launchSettings.json` impose `Development`). La fixture `api-client.ts` lit les liens dans le dernier email capturé (`/api/e2e/last-email`) et attend un lien différent du précédent : l'email part de l'outbox, après la réponse 204. Un E2E de plus qu'en v1, `sound-on-click.spec.ts`, vérifie que le son ne part que d'un clic (justifié dans `parity-exceptions.json`). **Sonde de santé** : `ng serve --configuration e2e` ne relaie pas `/health` (il répond le `index.html`) : les E2E coupent la sonde (`__disableHealthPolling`) ; lancer l'app à la main avec cette configuration affiche donc l'overlay « Service indisponible » au bout de 15 s (utiliser `npm start`).
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

## Domaine gameplay

`src/app/gameplay/`, quatre couches. La manche d'un morceau (écouter, répondre, voir la réponse), partagée par Daily et plus tard Runs ; elle ne connaît aucun mode (Sheriff : `gameplay` n'importe aucun mode). Depuis D2 ; aucun écran ne la route avant E5.
- `domain/` (TypeScript pur) : `track-round.ts`, la machine à états (phases `ready`, `loading`, `playing`, `listened`, `submitting`, `revealed`, `audio-error`, `no-preview`, `submit-error`) : chaque transition rend la manche suivante (ou la même). Le mode fournit une `ListenPolicy` (paliers, prolongeable ou non) et une `HintPolicy` (seuils de déblocage, les réglages du back) ; la manche rend un `RoundSubmission` (palier annoncé, `wasExtended`, artiste, titre) à envoyer. `answer.ts` (saisie libre coupée au premier « - », navigation en boucle dans les propositions), `round-result.ts` (ce que le serveur révèle, **sans les points** : ils sont au mode), `hint-label.ts` ;
- `data-access/` : `AudioPort` (classe abstraite) et son implémentation `HowlerAudioPort`, `withTrackRound()` (`signalStoreFeature` : l'état de la machine, ses transitions en méthodes, les ordres au lecteur, le lecteur qui fait avancer la manche par un `effect`) et `TrackRoundStore` (`signalStore(withTrackRound())`, à fournir à la page du mode), `AnswerSearchStore` (saisie et autocomplete) avec `AnswerSearchPort` / `CatalogueAnswerSearch` (`GET /api/catalogue/search`), `gameplay.providers.ts` ; aides de test dans `testing/` (`FakeAudioPort`, `makeToneUrl` : un vrai son WAV en adresse `blob:`) ;
- `feature/` : `TrackRoundComponent` (`app-track-round`, lecteur + indices + saisie + confirmations + révélation ; il **injecte** le `TrackRoundStore` du mode et fournit lui-même son `AnswerSearchStore`), `provideGameplay()` ;
- `ui/` : `RoundPlayerComponent` (chrono, barre avec un repère par palier, ↺, « ▶ Xs », erreur de lecture, pas d'extrait), `AnswerInputComponent` (champ, ✕, liste, clavier), `HintPanelComponent`, `RevealCardComponent`, `GuessTimeChartComponent`, tous présentationnels.

Règles :
- **Le mode pilote, la manche ne connaît ni le réseau ni les points.** Le mode appelle `store.start(config, extraitSuivant)`, écoute `answered` (le `RoundSubmission`), envoie la réponse puis appelle `store.reveal()` et passe le `result` à `<app-track-round>` — ou `store.submissionFailed()`. Pour un indice, `hintRequested(niveau)` part, le mode interroge le back puis appelle `store.applyHints(niveau, indices)`. Il projette ses éléments dans `[roundActions]`, `[roundBadge]`, `[roundScore]` et `[roundNext]`.
- **Le mode envoie l'écoute au serveur** (`PATCH …/listening`) à chaque changement de `chosenSeconds` du store, comme la v1 : le serveur débloque les indices (sinon 409) et pose le plancher anti-triche (piège 35) d'après ce palier. La manche ne le fait pas elle-même (pas de réseau).
- **« Réessayer » après un échec de lecture** recharge l'extrait ; si la `RoundConfig` fournit `refreshPreviewUrl`, depuis une adresse fraîche (signature Deezer expirée, piège 14). Une réponse qui arrive après la fin de la manche est ignorée.
- **Fourni par la route du mode** : `provideGameplay()` (Howler, autocomplete, adresse de l'API du catalogue) est dans les `providers` de la route Daily (`DAILY_ROUTES`, E5), pas dans `app.config.ts` : Howler (CommonJS, `allowedCommonJsDependencies` dans `angular.json`) reste ainsi dans le morceau chargé à la demande.
- **L'`AudioPort`** : `load(url, suivant)`, `playUntil(s)`, `replay(s)`, `playFull()`, `stop()`, `unlock()`, signaux `state` (`idle`, `loading`, `ready`, `playing`, `finished`, `error`) et `position`. **Un échec est `error`, jamais `idle`** (piège 33). `HowlerAudioPort` joue chaque palier comme un segment (le « sprite » de Howler, dont l'objet est partagé avec Howl) : le navigateur s'arrête à l'échantillon près, aucun chrono. En Web Audio, le segment court jusqu'à la fin de l'extrait et l'arrêt au palier est programmé sur l'horloge audio (`AudioBufferSourceNode.stop(t)`, son de Howler lu par ses méthodes internes, version figée) : **« écouter plus » pendant la lecture repousse cet arrêt sans couper le son** (relancer le son faisait un à-coup à chaque palier, signalé sur le staging le 09/10). **Arrêté à un palier, « écouter plus » relit depuis le début** jusqu'au nouveau palier, comme en v1. Demandé pendant le chargement, il est gardé (piège 40). Un seul extrait en cours et le suivant restent décodés (un extrait décodé pèse environ 10 Mo). `navigator.audioSession.type = "playback"` est posé avant chaque lecture (iPhone en mode silencieux). **`unlock()`** (via `TrackRoundStore.unlockAudio()`) se fait dans le gestionnaire du clic, avant tout appel réseau : Howler ne crée son contexte audio qu'au premier extrait et ne le déverrouille qu'au geste suivant (sur iPhone, il le recrée même à ce moment, fréquence de 48 kHz) ; sans cela, le premier morceau lancé après les appels du démarrage resterait muet jusqu'au toucher suivant. `unlock()` crée le contexte, fait le déverrouillage de Howler une fois pour toutes, puis relance le contexte (méthodes internes de Howler 2.2.4, version figée). L'extrait est téléchargé par `XMLHttpRequest` : CORS ouvert chez Deezer, et l'expiration de la signature n'a plus d'effet une fois le son chargé (piège 14). Aucun audio ni pochette Deezer n'est gardé hors de la mémoire de la page (piège 47).
- **Tests du lecteur** : `howler-audio.port.spec.ts` joue de vrais sons dans Chromium (lancé avec `--autoplay-policy=no-user-gesture-required`, `vitest.config.ts`) et mesure le temps qui s'écoule jusqu'à la fin du palier. Les stores et composants utilisent `FakeAudioPort`.
- **Indices** : le nombre de boutons suit `HintPolicy` ; le front n'invente aucun niveau. Comme en v1, tous les niveaux débloqués et pas encore révélés se proposent ensemble. Libellé du bouton : `hintButtonKey(HintPolicy.kinds[niveau - 1])` (« Indice année », « Indice artiste », sinon « Indice N »). Étiquette d'un indice révélé : `hintLabelKey(kind)` (`year`, `artist…`, sinon générique) ; les types exacts viennent du back (E2).
- **Entrée dans le champ** : `AnswerInputComponent` émet `enter` (l'événement clavier) et c'est la manche (`TrackRoundComponent.onEnter`) qui choisit la proposition en surbrillance, en lisant le store à cet instant et en empêchant alors la validation du formulaire. L'entrée `highlighted` du composant n'est mise à jour qu'au prochain cycle d'affichage : `↓` puis `Entrée` enchaînés vite (un E2E, un joueur rapide) la voyaient encore à -1 et validaient la saisie (trouvé par `autocomplete-keyboard-nav.spec.ts`).
- Les sélecteurs que les E2E de la v1 utilisent sont gardés (champ « Artiste — Titre », ✕, « Valider », « Valider quand même », « ▶ Xs », « ↺ Xs », `data-testid="guess-time-chart"` et `data-bucket`) : E5 n'aura qu'à les rebrancher.

## Domaine daily

`src/app/daily/`, quatre couches. Le jeu du jour (E5) : une page `/daily` qui affiche l'écran de la partie (`DailyScreen` : `loading`, `welcome`, `resume_prompt`, `playing`, `done`, `already_played`, `no_challenge`, `error`), pilote la manche du domaine `gameplay`, la série et les gels, les statistiques du jour et le partage.
- `domain/` (TypeScript pur) : `daily.ts` (les types : état du jour, réglages, partie, réponse révélée, statistiques), `daily-screen.ts` (**la machine des écrans** : `screenAfterToday`, `refocusContext`), `streak.ts` (série, mode de la gélule, pluriels, dates en minuit UTC), `toasts.ts` (quels toasts de fin de partie), `countdown.ts`, `share-text.ts`, `round-result.ts` (ce que la carte de révélation montre d'une réponse) ;
- `data-access/` : `DailyApi` (adaptateur du client `api/daily`, **seule** porte vers lui : types du domaine, `undefined` → `null`, dates en texte ; `start()` rend une issue, pas une erreur ; `submitAnswer` **réessaie 2 fois** une coupure ou un 5xx, jamais un 4xx, piège 32), `DailyGameStore` (voir plus bas), `DailyShare` (le texte `✅/❌` dans le presse-papier), `daily.providers.ts` (adresse de l'API), `testing/fake-daily-api.ts` ;
- `feature/` : `DailyPage` (fournit `DailyGameStore`, `TrackRoundStore` et `DailyShare`), `daily.routes.ts`, `leaveGameGuard`, `provideDaily()` (branché dans `app.config.ts`) ;
- `ui/` : écrans et briques de présentation (`welcome-screen`, `resume-screen`, `status-screen`, `already-played-screen`, `final-recap-screen`, `track-results-list` + sa pop-up histogramme, `score-distribution-chart`, `streak-pill`, `streak-sheet` (contenu d'un panneau bas `ModalService.openSheet`), `freeze-cells`, `streak-icon`, quatre toasts (`guest-streak`, `lost-streak`, `gel-used`, `gel-earned`), `share-button`, `deezer-badge`, `daily-brand`, `daily-progress`, `daily-footer`, `score-count`). Aucun n'injecte de service de `core/` (la langue, la série, l'identité arrivent par des entrées).

**`DailyGameStore`** : l'écran, la partie (`sessionId`, morceaux, réponses, position), la série, les statistiques, le compte à rebours. Règles :
- **Le son ne démarre que sur un clic** : `begin()` (« Commencer », « Reprendre ») et `nextTrack()` (« Piste suivante ») lancent la manche ; jamais l'arrivée sur la route, un `effect`, ni le retour de l'onglet au premier plan. Ils commencent par `round.unlockAudio()`, **avant tout `await`** (`retryNoChallenge()` aussi) : la manche ne démarre qu'après les appels réseau, hors du geste. Les navigateurs ne jouent un son qu'après un geste, et Howler attend alors en silence (E2E `sound-on-click`). La reprise après un rechargement passe par l'écran de reprise.
- **L'écoute part au serveur à chaque palier choisi** (`PATCH …/listening`, un `effect` qui suit `TrackRoundStore` et ne lance jamais de son) : le serveur débloque les indices et fixe le plancher anti-triche (piège 35). Les envois se suivent ; une demande d'indice attend le dernier.
- **Reprise** : le plancher d'écoute et les indices déjà payés du morceau en cours reviennent dans la `RoundConfig` (paliers sous le plancher non proposés). « Réessayer » après un échec de lecture redemande une adresse d'extrait fraîche (`refreshPreviewUrl` = reprendre la partie, piège 14).
- **Réponse** : `submit()` envoie, enregistre, puis `reveal()` ; un échec définitif remet la manche en « Réessayer » sans rien enregistrer (piège 32). La pochette et le lien Deezer n'existent qu'avec la réponse (pièges 31 et 47).
- **Retour de l'onglet** (`refresh()`) : relit l'état du jour ; une partie finie ou abandonnée ailleurs mène à « déjà joué », jamais de retour à l'accueil pendant la partie.
- **Statistiques du jour** (`stats/today`) lues en entrant sur un écran de fin ; un échec les met à `null` et l'écran s'affiche sans (piège 41). **Série** relue après la dernière réponse. **Toast « série perdue »** d'un invité : une fois par série perdue (`StoragePort`).
- **Identité** : `begin()` crée l'invité (`SessionLoader.ensureGuest`, `POST /api/players/guest`) avant `POST /api/daily/sessions`, qui exige un cookie ; la lecture de l'état (`GET /api/daily/today`) ne crée rien.

**`DailyPage`** : le gabarit `#headerLeft` est donné à `HeaderSlot` (la gélule de série, ou le score en partie) ; abandonner et quitter la partie passent par `ModalService` (`confirm`, `openSheet`) ; le panneau de série par `openSheet(StreakSheetComponent)` ; `beforeunload` et la garde de sortie protègent une partie en cours (une confirmation ouverte se ferme d'elle-même si la partie finit entre-temps) ; le badge « À écouter sur Deezer » est projeté dans `[roundBadge]`, au-dessus du score de l'en-tête (`z-40`).

## Domaine admin

`src/app/admin/`, quatre couches. Depuis C3 : la coquille et l'onglet **Pool** (`/admin/catalogue`) ; dashboard, défis, joueurs et actions arrivent en F2 (le domaine `admin` peut importer `account`, pour `BrowserIdComponent`).
- `domain/` (TypeScript pur) : `PoolTrack` (disponible ou utilisé se déduit de `usageCount`), filtres (texte cherché dans l'artiste, le titre **et « artiste titre » collés**, piège 28 ; statut, extrait, plage de dernière utilisation), tri (**par défaut les disponibles avant les utilisés**, comme en v1 ; désactivés toujours en fin ; valeurs vides en dernier), pagination par 15, autonomie du pool en jours (`DEFAULT_TRACKS_PER_CHALLENGE` = 5 en attendant que le réglage vienne de l'API, F2/E) ;
- `data-access/` : `CatalogueApi` (adaptateur du client, rend des types du domaine ; `findPreviewUrl` redemande l'extrait à Deezer, le pool n'en garde pas l'adresse signée), `PoolStore` (liste, filtres, tri, page, sélection, ajout, renommage, désactivation, suppression : **aucune mutation locale**, la liste est relue après chaque action ; les actions rendent l'erreur à afficher dans leur fenêtre ou `null`), `DeezerSearchStore` (panneau : attente de 300 ms, recherche annulée par la suivante, ajout par ligne, liaison avec le filtre), `AudioPreviewPlayer` (un seul son à la fois, aucun audio gardé, piège 47) ; `catalogue.providers.ts` donne l'adresse de l'API au client ;
- `feature/` : `AdminShellPage` (mise en page de la v1 : titre et ID navigateur centrés, barre des 5 onglets `ADMIN_TABS` de `admin-tabs.ts` dans l'ordre de la v1, déconnexion sous le contenu ; accès : visiteur ou invité → « Connecte-toi d'abord » ; compte sans le rôle → « Accès refusé » ; admin → onglets et déconnexion ; l'ID navigateur est affiché dans tous les cas), `TabComingSoonPage` (onglet de F2 pas encore construit : page d'attente sous la barre des onglets, qui reste en place), `CataloguePage` (fournit `PoolStore`, `DeezerSearchStore` et `AudioPreviewPlayer`, câble la liaison filtre ↔ recherche, reprend et écrit `?page=` — numérotée à partir de 1, `replaceUrl` —, ouvre les fenêtres), fenêtres `PreviewTrackDialog`, `EditTrackDialog` (renommer est permis **à tout moment, défi du jour compris**, avec un avertissement dans ce cas), `DeleteTrackDialog`, `ADMIN_ROUTES`, `provideAdmin()` (branché dans `app.config.ts`) ;
- `ui/` : `PoolToolbar`, `PoolFilterBar`, `PoolTable` (pagination comprise), `SearchPanel`, purement présentationnels.

Règles : les fenêtres du pool s'ouvrent avec **`injector: inject(Injector)`** (option de `ModalService`) : sans elle, le CDK Dialog ne voit que la racine et ne trouverait pas `PoolStore`. Fermer la fenêtre d'écoute arrête le son et une réponse de Deezer arrivée après la fermeture ne relance rien (piège 42, testé). Un morceau utilisé ne se supprime pas (le bouton « Désactiver » le remplace) ; un morceau du défi du jour ne se désactive pas (bouton grisé). Les accès à l'admin sont revérifiés par l'API à chaque requête : l'écran d'accès n'est qu'un confort. La coquille met le `<router-outlet>` dans un bloc `w-full` : posé seul dans la colonne flex, il compterait comme un élément et doublerait l'écart avant l'onglet. Une page de l'admin prend toute la largeur (`host: { class: 'flex w-full min-w-0 justify-center' }`) : centrée par la coquille (`items-center`), elle prendrait sinon la largeur du tableau et déborderait de l'écran d'un téléphone au lieu de faire défiler le tableau seul.

## SonarCloud

Une grande partie de la v2 reprend du code de la v1 (styles, remontée d'erreurs, composants de la coquille), ce que Sonar compte comme de la duplication sur le nouveau code. Exclusion posée dans l'UI SonarCloud (Administration → Analysis Scope → Duplication Exclusions) : `src/front/**, src/back/**`. **À retirer en I2** (suppression de la v1, ticket #236).

## Conventions

Mêmes que la v1 (cf. CLAUDE.md racine) : couleurs par `var(--…)`, un composant = `.ts` (+ `.html` s'il est long), `OnPush`, écouteurs globaux dans `host: {}`, état exposé en lecture seule, traductions dans chaque composant qui affiche du texte. En plus : modales **uniquement** par `ModalService` (plus de modale maison ; `injector` pour qu'une fenêtre retrouve les stores de sa page), boutons par `appButton`.

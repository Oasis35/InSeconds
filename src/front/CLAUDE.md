# CLAUDE.md - front

Front Angular d'InSeconds (`src/front/InSeconds.Client`). Vue d'ensemble, routes fonctionnelles et pièges numérotés : [`CLAUDE.md`](../../CLAUDE.md) racine. Ce fichier garde ce qui sert à toute tâche front ; le détail par sujet est dans `.claude/rules/front/*.md`, chargé quand on lit un fichier concerné (liste en fin de fichier). Une PR qui change une règle met à jour le fichier qui la porte.

## Commandes

```bash
cd src/front/InSeconds.Client
npm ci
npm start                    # :5176, /api /health /jobs relayés vers l'API :5175 (proxy.conf.json)
npx ng test --watch=false    # Vitest en mode navigateur (Chromium)
npm run lint:arch            # Sheriff + couche domain/ pure
npm run build                # build de prod (service worker compris), doit passer avant un commit
npm run generate-api         # clients NSwag, depuis les documents OpenAPI sauvegardés par le back
E2E_DB_CONNECTION="Host=localhost;…;Database=inseconds_e2e;…" npm run e2e   # Playwright (cf. e2e.md)
```

- Node 24 (24.15 au moins, exigé par Angular CLI). Vite est forcé dans `overrides` de `package.json` (`@angular/build` en fige une version vulnérable) : à retirer quand `@angular/build` embarque Vite 8.3.5 ou plus.
- Chromium installé ailleurs (environnement sans `playwright install`) : `PLAYWRIGHT_CHROMIUM_PATH=/chemin/vers/chromium npx ng test --watch=false`.
- Angular, CDK, NgRx, ngx-translate, Tailwind, Vitest et Sheriff sont épinglés à une version exacte ; tous les `@angular/*` et `@ngrx/signals` changent ensemble (piège 15).

## Couches et dossiers

- `src/app/<domaine>/` pour `gameplay`, `daily`, `runs`, `social`, `account`, `admin`, chacun en quatre couches : `domain/` (TypeScript pur), `data-access/` (stores, adaptateurs de l'API), `feature/` (pages routées, fenêtres, `provide-*.ts`, gardes, routes), `ui/` (présentation).
- `core/` : transverse (session, erreurs, langue, version, santé, partage, presse-papier, stockage, coque) ; `ui/` : kit visuel de la DA ; `api/<module>/api.generated.ts` : clients NSwag générés.
- `app.ts`, `app.config.ts`, `app.routes.ts` : la composition (seuls fichiers qui voient toutes les couches `feature`).
- Dans `feature/` et `ui/`, un composant = un dossier à son nom (`login/login.page.ts`, `run-disc/run-disc.component.ts`) avec son `.spec.ts`. Restent à la racine de la couche : routes, `provide-*.ts`, gardes, `reload-moment.ts`.
- Aides de test dans `testing/` de la couche qui s'en sert, exclues du build par `tsconfig.app.json` comme les `.spec.ts`.

## Frontières (Sheriff)

`npm run lint:arch` = `sheriff verify src/main.ts` + `node scripts/check-pure-domain.mjs` (job CI `front`). Ce que chaque domaine importe en plus de lui-même, de `core`, `ui` et `api` (`DOMAIN_DEPENDENCIES` de `sheriff.config.ts`) :

```ts
gameplay: [],
daily: ['domain:gameplay', 'domain:account'],
runs: ['domain:gameplay', 'domain:account', 'domain:social'],
social: [],
account: [],
admin: ['domain:account', 'domain:gameplay'],
```

Règles des couches (`depRules`) :
- `layer:domain` n'importe que `layer:domain` ; `check-pure-domain.mjs` y refuse `@angular/`, `@ngrx/`, `rxjs`, `@ngx-translate/` (Sheriff ne voit pas les bibliothèques).
- `layer:data-access` : `domain`, `data-access`, `api`, `core`, `environment`. Seule couche qui touche `api/`.
- `layer:feature` : `feature`, `data-access`, `ui`, `domain` du domaine, `core`, `ui/`. Jamais `api/` ni `environment/` : l'adresse de l'API passe par `data-access` (`provideDailyApi`…).
- `layer:ui` : `ui` et `domain` du domaine, `ui/`. Un composant de présentation ne voit donc aucun service de `core/` : tout arrive par des entrées.
- `core` : `core`, `ui`, `environment`, aucun domaine. `ui` : `ui` seul. La racine (`app.*`) : `core`, `ui`, `layer:feature`, `environment`.

Sheriff ne vérifie que les fichiers atteignables depuis `src/main.ts` (routes à la demande comprises) : les `.spec.ts` et `testing/` ne sont pas vérifiés, `check-pure-domain` les ignore aussi. Un nouveau domaine s'ajoute à `DOMAINS` et `DOMAIN_DEPENDENCIES` de `sheriff.config.ts`.

## Fournir un domaine

- **Par sa route, chargée à la demande** : `DAILY_ROUTES` (`provideDailyApi()`, `provideGameplay()`), `RUNS_ROUTES` (`provideRunsApi()`, `provideSocialApi()`, `provideGameplay()`), `SOCIAL_ROUTES` (`provideSocialApi()`), `ADMIN_ROUTES` (`provideAdminApi()` : clients admin, catalogue, daily, runs et social). Seul le client Players est au démarrage (`provideAccount()`, l'accueil lit `/me`). Raisons : importer le jeton d'un client met tout le fichier généré dans le bundle initial (budget 500 kB) ; un client généré pris à la racine n'y trouve pas son adresse et appelle le domaine du front, sans erreur en dev et en E2E où l'adresse est vide. Les adaptateurs de ces clients sont en `@Injectable()` sans `providedIn` : hors de leur route, ils lèvent « No provider ».
- **Stores de page** : `providers: [XStore]` sur la page (ou la coque qui porte l'état, `DailyShellComponent`). Seuls stores à la racine : `SessionStore`, `ShellChromeStore`, `SetlistAccessStore`.
- **Brancher un domaine dans `core`** : `core` ne connaît aucun domaine. Il déclare un jeton (`HOME_MODE_ENTRIES` multi, `BOTTOM_BAR_SLOT`, `DAY_FRIENDS_SLOT`, `DAILY_DONE_LOADER`), le domaine le remplit dans son `provideX()` appelé par `app.config.ts` (`provideSocial()`, `provideRuns()`, `provideDailyStatus()`, `provideAdminStatus()` : il pose `ShellChromeStore.adminAlerts`, son lecteur ne se charge que pour un admin), composants en `load: () => import(…)` qui fournissent eux-mêmes le client de leur API (`providers: [provideSocialApi()]`). Les entrées de `HOME_MODE_ENTRIES` se rangent par leur `order` (`HOME_ENTRY_ORDER` : la carte amis, puis la carte Survie), pas par l'ordre des fournisseurs.
- **Client d'un domaine hors de sa route** : injecteur jetable, `createEnvironmentInjector(provideXApi(), parent)` détruit dans un `finally`, derrière un jeton que les tests remplacent (`SETLIST_ACCESS_LOADER`, `DAILY_DONE_LOADER`).

## Clients de l'API (NSwag)

Un client par module dans `src/app/api/<module>/api.generated.ts` (fichier généré, commité, seul fichier exclu de Sonar dans l'UI SonarCloud), généré par `nswag/<module>.nswag.json` (`players`, `catalogue`, `daily`, `runs`, `social`, `admin`) depuis `src/back/InSeconds.Api.Testing/openapi/<module>.json`. Après tout changement d'endpoint : régénérer le document côté back (`src/back/CLAUDE.md`), `npm run generate-api`, commiter les deux ; le job CI `api-clients` régénère et échoue sur un écart. Un nouveau module ajoute son `nswag/<module>.nswag.json` (jeton `<MODULE>_API_BASE_URL`, `SingleClientFromOperationId`) et sa ligne dans le script `generate-api`.

## Stores et adaptateurs

- **Adaptateur `XApi`** (`data-access/`, seule porte vers son client généré) : rend des types du domaine. Le JSON livre les dates en texte alors que le client les annonce en `Date`, `undefined` devient `null`, un `204` levé par le client devient `null`. Un refus attendu rend une issue typée (`{ kind: 'ok', … } | { kind: 'already_played' } | …`), pas une exception. **Le store ne lit jamais un DTO NSwag.**
- **Store** (`signalStore`) : méthodes `async`/`await` avec `try/catch`, statut local par action (`…Status`) ou `withRequestStatus()` (`core/store/`, optionnel : `setPending()`, `setFulfilled()`, `setError(await toAppError(e))`). Une lecture qui peut être doublée garde un compteur (`let latest = 0`) et ignore une réponse périmée. L'historique d'un mois d'un mode (`DailyHistoryStore`, `RunHistoryStore`) est `withMonthHistory<H>(() => lecture)` de `core/store/` : le mode ne fournit que sa lecture. Minuteries et abonnements libérés dans `withHooks({ onDestroy })`.
- État protégé (défaut de SignalStore), exposé en lecture seule, modifié par les méthodes. Un nom d'état n'est jamais celui d'une méthode du même store (ils se masquent : suffixe `…Status`).
- Après une écriture, relire plutôt que muter l'état localement (règle de l'admin et des groupes).

## Formulaires et composants

- Formulaires en Signal Forms (`@angular/forms/signals`), jamais Reactive Forms ni `ngModel`.
- Composants standalone, `ChangeDetectionStrategy.OnPush`, `input()` / `output()`, contrôle de flux `@if` / `@for`, écouteurs globaux dans `host: {}`, `TranslatePipe` dans chaque composant qui affiche du texte, `data-testid` sur ce que les tests visent.
- Gabarit en ligne par défaut, `templateUrl` quand il est long. Styles en Tailwind et tokens `var(--…)` ; pas de `.scss` de composant sauf exception (`ui/button`). Règles visuelles : `direction-artistique.md`.
- Modales et panneaux bas uniquement par `ModalService` (`ui/modal`), avec `injector: inject(Injector)` pour retrouver les stores de la page ; boutons par `appButton`.
- Zoneless : l'écran ne se met à jour que sur un signal, un événement du gabarit ou un `markForCheck()`.

## Erreurs

- `toAppError()` (`core/errors/app-error.ts`) convertit toute erreur (`HttpClient`, `ApiException` ou `ProblemDetails` d'un client NSwag, corps JSON ou Blob) en `AppError { code, status, traceId }` ; `common.network` sans réponse, `common.unexpected` sans code lisible.
- `ERROR_MESSAGE_KEYS` (`core/errors/error-messages.ts`) est la seule table code → clé i18n. Un code inconnu s'affiche en `errors.common.unknown` avec son `traceId` (`<app-error-message>`). Un nouveau code d'API s'ajoute à la table et à `fr.json` / `en.json`. Ne jamais renommer un code publié.
- Remontée vers `POST /api/client-errors` : `ErrorReportingService`, `GlobalErrorHandler`, intercepteur des 5xx et coupures réseau. Jamais de query string, codes de liens masqués (`maskLinkCodes`). Détail : `core-pwa.md`.
- Les violations CSP partent à `POST /api/csp-reports` envoyées par le navigateur lui-même, pas par le front (aucun écouteur `securitypolicyviolation`).

## Traductions

`public/i18n/{fr,en}.json`, rangées par domaine. `core/i18n/translations.spec.ts` vérifie : mêmes clés en FR et EN, aucune valeur vide, chaque clé de premier niveau dans `DOMAINS` (à compléter pour un nouveau domaine), chaque clé de `ERROR_MESSAGE_KEYS` présente. Il ne vérifie **pas** qu'une clé utilisée dans un gabarit existe : une faute de clé s'affiche telle quelle à l'écran. Les clés qui ne servent plus sont à retirer.

## Tests (Vitest)

- Un `.spec.ts` à côté de chaque fichier ; tout nouveau composant (page et fenêtre comprises) a le sien.
- Faux adaptateurs dans `data-access/testing/fake-*-api.ts`, fournis par leur fonction (`provideFakeDailyApi`, `provideFakeRunsApi`, `provideFakeSocialApi`, `providePlayersApiFake`, `provideCatalogueApiFake`…). Lecteur : `FakeAudioPort` / `provideFakeAudio`, `FakeWaveformPort` / `provideFakeWaveform`, `makeToneUrl` (un vrai son WAV en adresse `blob:`) dans `gameplay/data-access/testing/`.
- `provideTranslateService()` sans loader : le gabarit affiche les clés, les assertions portent sur des clés ou des `data-testid`, jamais sur un libellé français.
- Entrées par `fixture.componentRef.setInput(…)`. `settle(fixture)` (`account/feature/testing/dom.ts`) laisse passer les promesses des stores puis rafraîchit (`whenStable` seul ne suffit pas) ; `type()` y écrit dans un champ des Signal Forms. `renderHost` (`admin/ui/testing/host.ts`) monte un composant de présentation dans un hôte.
- `restoreMocks: true` (`vitest.config.mts`) restaure les `vi.spyOn` ; minuteries par `vi.useFakeTimers()`, rendues en fin de test.
- Chromium lancé avec `--autoplay-policy=no-user-gesture-required` : les tests du lecteur jouent de vrais sons.

## Routes (mécanisme)

- `/` et `/daily` : un `UrlMatcher` (`homeOrDailyMatcher`) les envoie à `DAILY_ROUTES` sans consommer de segment ; la coque `DailyShellComponent` porte la partie et ses deux pages (`HomePage`, `DailyPage`) la montrent, d'où une partie qui survit au passage de l'une à l'autre.
- Toute ancienne adresse redirige en gardant query string et fragment : `redirectKeepingQuery`, ou `redirectRunsLink` / `redirectHistoryLink` pour un paramètre (lien magique, `from=legacy`, `utm_source`). Chaque redirection a son test dans `app.routes.spec.ts`.
- Tout le reste : `NotFoundPage`. Liste fonctionnelle des routes : `CLAUDE.md` racine.

## Recette : ajouter un écran de bout en bout

1. **Domaine pur** (`domain/`) : types et règles d'affichage, avec leur spec.
2. **Endpoint** côté back, document OpenAPI régénéré, `npm run generate-api`.
3. **Adaptateur** `XApi` (types du domaine, issues typées) et son faux dans `data-access/testing/`, avec specs.
4. **Store** fourni par la page, avec sa spec contre le faux.
5. **Composants `ui/`** présentationnels (entrées et sorties seulement), puis la **page** `feature/` qui fournit le store.
6. **Route** dans `<domaine>.routes.ts` avec ses `providers` ; une adresse remplacée redirige par `redirectKeepingQuery`, testée dans `app.routes.spec.ts`.
7. **Entrée depuis `core`** si une autre page doit y mener sans importer le domaine : un jeton de `core/shell`, rempli par `provideX()`.
8. **Erreurs et traductions** : codes dans `ERROR_MESSAGE_KEYS`, clés FR et EN ; un nouveau domaine s'ajoute à `DOMAINS` (`translations.spec.ts`) et à `DOMAINS` / `DOMAIN_DEPENDENCIES` (`sheriff.config.ts`).
9. **E2E** si le parcours le mérite (`e2e.md`).
10. `npx ng test --watch=false`, `npm run lint:arch`, `npm run build`, puis `gardien-da` sur l'écran et `relecteur-pr` sur la branche.

## Pièges du front : où les lire

| Piège (racine) | Fichier de règles |
|---|---|
| 14 (extrait expiré, côté front), 33, 40, 44, 46, 50 (forme d'onde, côté front) | `gameplay-audio.md` |
| 32 (réponse perdue), 41 (stats du jour) | `daily.md` |
| 28 (filtre multi-champs), 42 (fenêtre d'écoute) | `admin.md` |
| 45 (presse-papier), 49 (service worker et CSP, côté front) | `core-pwa.md` |
| 10 (E2E ; le 9 est à la racine) | `e2e.md` |
| 21, 30 (lien magique) | `account.md` |

## Règles par sujet (`.claude/rules/front/`)

- `direction-artistique.md` : tokens, couleurs, tuile de focus, boutons, champs, modales, animations.
- `gameplay-audio.md` : la manche, le lecteur audio, la forme d'onde, la fenêtre d'écoute.
- `daily.md` : le jeu du jour, sa coque, la série, le partage, les jours passés.
- `runs-social.md` : la Survie, les groupes et le classement, la coque de l'interface Survie.
- `account.md` : identité, lien magique, profil, droits RGPD.
- `admin.md` : coquille, onglets, panneau technique.
- `core-pwa.md` : coque de l'app, nouvelle version, service worker, CSP, remontée des erreurs, partage.
- `e2e.md` : Playwright, hôte de test, répartition en CI.

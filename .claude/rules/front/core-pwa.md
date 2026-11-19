---
paths:
  - "src/front/InSeconds.Client/src/app/core/**"
  - "src/front/InSeconds.Client/src/app/app.*"
  - "src/front/InSeconds.Client/ngsw-config.json"
  - "src/front/InSeconds.Client/nginx/**"
  - "src/front/InSeconds.Client/Dockerfile.prod"
  - "src/front/InSeconds.Client/scripts/check-nginx-headers.sh"
  - "src/front/InSeconds.Client/public/**"
---
# Core : coque, nouvelle version, service worker, CSP, erreurs, partage

`core/` ne connaît aucun domaine : un domaine s'y branche par un jeton (cf. `CLAUDE.md` du front, « Fournir un domaine »). Coque de l'interface Survie (`ShellChromeStore`, `BOTTOM_BAR_SLOT`, `HOME_MODE_ENTRIES`, `DAILY_DONE_LOADER`) : `runs-social.md`.

## Coque (`App`)

- `HealthService` sonde `/health` toutes les `HEALTH_POLL_MS` ; l'overlay « Service indisponible » vient après `HEALTH_KO_THRESHOLD` échecs de suite et part au premier succès.
- `from=legacy` (redirection nginx de l'ancienne adresse `code.run`) ouvre l'avis « l'adresse a changé » par `ModalService` ; le paramètre est retiré avant la première navigation. Son élément hôte est en `block` : resté inline, Chromium le plaçait au-dessus du bouton dans `elementsFromPoint` et Playwright refusait le clic.
- Drapeaux E2E : `window.__disableAnimations` (classe `no-anim`) et `window.__disableHealthPolling`.
- `<app-account-link>` (`core/shell/account-link`) : les accès de l'en-tête (cadenas `/admin`, initiale du compte ou « Connexion »), projetés par les pages du jeu, de l'historique et des classements ; il n'y a pas d'en-tête global.
- `PageMetaService` (`core/seo`) : canonique, `og:url`, `noindex`, titre et description à chaque navigation ; pas de `hreflang` (les deux langues partagent les adresses).

## Nouvelle version (`VersionService`)

- Une version prête est **appliquée seule** (rechargement) au premier moment sûr, sans rien demander. Chaque page déclare son moment par `allowReload(() => moment, destroyRef)` : `now`, `background` (onglet en arrière-plan) ou `navigation` (au prochain changement de page). Le plus prudent l'emporte ; une page qui ne dit rien vaut `navigation`.
- Un changement de page applique la mise à jour, jamais avec une fenêtre ouverte (CDK `Dialog`) ; une navigation qui ne change que la query string ou le fragment n'est pas un changement de page.
- Garde-fou : un second rechargement automatique moins d'une minute après le précédent (`sessionStorage`) n'a pas lieu, le bandeau `<app-update-prompt>` s'affiche à la place. Le bandeau n'est qu'un secours (état irrécupérable du service worker) ; chaque affichage est remonté (`UpdatePrompt: unrecoverable (…)` ou `UpdatePrompt: reload-loop`).
- Vérification au démarrage, au retour au premier plan et toutes les `UPDATE_CHECK_INTERVAL_MS` au premier plan ; `registration.update()` par le jeton `SERVICE_WORKER_CONTAINER`.
- **Le rechargement active d'abord la version prête** (`SwUpdate.activateUpdate()`, un échec n'empêche pas de recharger) : sinon le worker garde la page sur l'ancienne version et le garde-fou se déclenche.
- **Remplacement du worker lui-même** (`controllerchange`) traité comme une nouvelle version, au même moment sûr. Si un nouveau worker s'installe au moment de recharger, on attend son `controllerchange` (`WORKER_SWAP_WAIT_MS`) pour ne recharger qu'une fois.
- Module introuvable après un déploiement (`Failed to fetch dynamically imported module`, `isStaleChunkError`) : `GlobalErrorHandler` recharge une fois (`reloadAfterStaleChunk()`, garde-fou d'une minute) au lieu de remonter l'erreur.
- Tests : `version.service.spec.ts`, `global-error-handler.spec.ts`.

## Service worker et CSP

- `provideServiceWorker('ngsw-worker.js')`, désactivé en dev. `ngsw-config.json` ne met en cache que les fichiers du front, **aucun `dataGroups`** (rien de l'API, aucun audio ni image Deezer : piège 47, règle de sécurité S10, vérifiée par `check-nginx-headers.sh`), et exclut `/jobs` des navigations.
- Couper le service worker chez tous les joueurs (bug grave) : servir `safety-worker.js` (copié à la racine du build) à la place de `ngsw-worker.js` et `worker-basic.min.js` ; il désinscrit le worker et vide ses caches.

**Piège 49 : le service worker garde la CSP de son installation** - corps dans `.claude/rules/deploy.md` ; côté front, retenir que toute origine tierce lue par la page va aussi en `connect-src`.

- CSP (règle de sécurité S14, vérifiée par `check-nginx-headers.sh`, job `nginx-headers`) : `nginx/csp.conf.template`, transformé au build (`CSP_MODE` = `report-only` par défaut ou `enforce`, `CSP_API_ORIGIN`), inclus par `security-headers.conf` dans chaque `location`. Le mode de la prod et du staging est fixé dans leur `docker-compose.*.yml`. Aucun script en ligne (`script-src 'self'`) : `inlineCritical: false` dans `angular.json`, l'inlining du CSS critique ajoutant un `onload=`. Une nouvelle origine tierce s'ajoute à la directive qui la lit **et** à `connect-src`.
- Les violations sont envoyées par le navigateur (`report-to`, `report-uri`) à `POST /api/csp-reports`, dès le chargement de la page : aucun écouteur `securitypolicyviolation` côté Angular (il ne voyait rien avant le démarrage et doublerait les rapports).
- nginx : cache immuable des bundles hashés, `no-cache` pour `index.html`, traductions, fichiers du worker et `manifest.webmanifest` ; la `location` qui sert les fichiers du worker est déclarée avant celle des `.js` (piège 20). Les E2E tournent sur `ng serve`, sans nginx : seul `check-nginx-headers.sh` vérifie en-têtes, types MIME et redirection `code.run`.

## Fichiers publics (`public/`)

- `og-image.jpg` (1200×630) se refait à chaque changement de DA, sans aucune pochette ni extrait Deezer (piège 47). Icônes du manifeste et `favicon.svg` reprennent « IN// » du logo.
- `robots.txt` écarte `/survie`, `/runs` et `/setlist` (les liens de playlists ne s'indexent pas) ; `sitemap.xml` n'est qu'un secours, Caddy envoie `/sitemap.xml` à l'API qui ajoute les jours publiés.

## Remontée des erreurs

- `ErrorReportingService` vers `POST /api/client-errors` : `GlobalErrorHandler`, intercepteur des 5xx et coupures réseau (`core/http`), diagnostics. Chaque envoi porte `appVersion` (`DEPLOYED_AT`) et `online` ; l'appareil est déduit côté API.
- Jamais de query string ; le code d'un lien de playlist ou d'invitation devient `{code}` (`maskLinkCodes`, `core/errors/link-path.ts`). Jamais un texte saisi, une adresse d'extrait ou une valeur de champ.
- Une coupure réseau survenue après le départ de la page (`pagehide`) n'est pas remontée.
- Diagnostics de la recette iPhone, à retirer une fois les causes trouvées (`docs/taches.md`) : `Viewport:` (`core/diagnostics/viewport-reporter.ts`, envoyé seulement si la page est zoomée ou plus large que l'écran, trois fois au plus) et `AudioStall:` (`gameplay-audio.md`).

## Partage, presse-papier, stockage

- `ShareService` (`core/share`) : sur écran tactile (`(pointer: coarse)`), le menu du téléphone `navigator.share({ text })`, **appelé dans le clic sans `await` avant** (sinon refusé) ; sur ordinateur, ou sans `navigator.share`, la copie. Menu fermé (`AbortError`) : rien de copié ni remonté ; autre échec : type d'erreur remonté, puis copie. `SHARE_LINK` = `appUrl` + `/?utm_source=share`. Tests : `share.service.spec.ts`, E2E `share-button.spec.ts`.

**Piège 45 : copie presse-papier intermittente** - `navigator.clipboard.writeText` peut rejeter même dans un vrai clic (« Document is not focused ») : `ClipboardService` (`core/clipboard`) se replie sur un textarea et `execCommand('copy')`, et remonte le rejet sans jamais le texte copié. E2E `share-button.spec.ts`.

- `StoragePort` (`core/storage`) : `localStorage` sans exception (navigation privée, stockage bloqué) ; le `localStorage` ne se lit que par lui, sous des clés `inseconds.*`. Le `sessionStorage` (garde-fous de `VersionService`, source d'arrivée) s'emploie sous `try/catch`.

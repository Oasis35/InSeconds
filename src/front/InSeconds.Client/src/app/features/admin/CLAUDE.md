# CLAUDE.md — feature `admin/`

Doc détaillée de la feature admin. Vue d'ensemble générale : voir le `CLAUDE.md` racine. Conventions Angular globales (signals, `OnPush`, `TranslatePipe`, `var(--...)`) : idem, pas répétées ici.

## Pattern architectural : service-as-store, zéro `@Input`/`@Output`

**Aucun `@Input()`/`@Output()` n'est utilisé nulle part dans la feature.** Les 8 sous-composants (`admin-login`, `dashboard-tab`, `pool-tab`, `challenges-tab`, `actions-tab`, `add-track-modal`, `delete-track-modal`, `preview-track-modal`) sont des "dumb components" côté données mais communiquent exclusivement via les services partagés injectés indépendamment dans chacun — pas de prop-drilling.

`AdminComponent` (shell ~45 lignes) fournit les 6 services via `providers: [...]` (portée composant — une instance par affichage de `<app-admin>`) :

```
AdminActionsService ─┐
AdminStatsService ────┼─→ AdminApiService ─┬─→ AdminHttpService (HTTP réel)
AdminPoolService ─────┘                     └─→ AdminStateService (signals d'état/triggers)
```

`AdminApiService` est le hub unique : combine `AdminHttpService` (I/O réseau) + `AdminStateService` (état/triggers) en 4 `rxResource` réactifs, sert de façade à `Stats`/`Pool`/`Actions` qui n'appellent **jamais** `AdminHttpService` directement.

### Graphe d'injection

```
AdminComponent (providers: les 6 services)
 ├─ injecte directement : AdminApiService (api), AdminStatsService (stats), AdminPoolService (pool)
 ├─ <app-admin-login>          → injecte AdminApiService
 ├─ <app-dashboard-tab>        → injecte AdminStatsService
 ├─ <app-pool-tab>             → injecte AdminPoolService
 │    ├─ <app-add-track-modal>    → injecte AdminPoolService
 │    └─ <app-delete-track-modal> → injecte AdminPoolService
 ├─ <app-challenges-tab>       → injecte AdminStatsService (même instance que dashboard-tab)
 │                               + PlayerIdentityService/ClipboardService (core/, exception au tableau
 │                               ci-dessus — cf. note plus bas)
 └─ <app-actions-tab>          → injecte AdminActionsService
```

`activeTab = signal<AdminTab>('dashboard')` pilote un `@if/@else if` qui instancie **un seul** tab à la fois (composant non actif détruit/recréé, pas `[hidden]`). Badges de la barre d'onglets : `stats.challenges().length` (défis), `pool.poolTracks().available.length + .used.length` (pool).

**`<app-browser-id>`** (`shared/browser-id/`, hors arbre ci-dessus) est monté directement dans `admin.component.html`, au-dessus du `@if (api.authenticated())` — donc rendu une seule fois, visible aussi bien sur l'écran de login que dans le shell authentifié. Composant autonome (aucun `@Input`), il injecte lui-même `PlayerIdentityService`/`ClipboardService`.

## `admin.models.ts` — DTO front écrits à la main

- `ResetResult { deleted, date }`, `RefreshPreviewsResult { checked, updated, failed }`, `TrackDto { position, artist, title, deezerTrackId }`, `PoolTrackDto { id, artist, title, deezerTrackId, hasPreview?: boolean|null, lastUsedDate?: string|null, usageCount?: number, unlockDate?: string|null }`, `PoolTracksResponse { available: PoolTrackDto[], used: PoolTrackDto[] }`, `DeezerTrackInfo { artist, title, previewUrl, deezerTrackId, coverHash? }`, `type AdminTab = 'dashboard'|'pool'|'defis'|'actions'`.
- `lastUsedDate`/`unlockDate` sont des dates ISO (`yyyy-MM-dd`, `DateOnly` back sérialisé en string) ; `unlockDate` est **calculée à la volée côté back** (jamais stockée), donc dépend de `TrackCooldownDays` au moment de l'appel `GET /api/admin/tracks`.
- **Piège** : `ChallengeDto` local (`{ id, date: string, tracks: TrackDto[] }`) porte le **même nom** que le `ChallengeDto` généré dans `api.generated.ts` (`date: Date`) — ce sont deux types différents non liés. Toute la feature admin utilise le type **local** (`../admin.models`). Ne pas les confondre lors d'un futur changement d'API.

## `services/admin-http.service.ts` — couche HTTP pure

`@Injectable()` (pas root — fourni par `AdminComponent`). `base = ${environment.apiUrl}/api/admin`, `storageKey = 'admin_token'`.

Signal `authenticated = signal(false)` — unique source de vérité, réexposée telle quelle par `AdminApiService.authenticated`.

- `checkAuth()` : `GET /me` fire-and-forget, positionne `authenticated`.
- `login(password)` : `POST /login`, succès → stocke `res.token` dans `localStorage['admin_token']`, `authenticated=true`. Échec → promesse rejetée, propagée à l'appelant.
- `logout()` : retire le token localStorage, `authenticated=false`. **Pas d'appel serveur** (logout purement local).
- `generateToday()`, `resetToday()`, `refreshPreviews()`, `addTrack(deezerTrackId)`, `updateTrack(id, deezerTrackId)`, `deleteTrack(id)`, `searchDeezer(q)`, `getPoolTracks()`, `getStats(day)`, `getChallenges()`, `updateTrackCooldownDays(days)` — tous retournent des `Observable` bruts non souscrits, sans gestion d'erreur ici (déléguée à l'appelant/`AdminApiService`).

## `services/admin-state.service.ts` — état UI pur (triggers)

`@Injectable()`, sans dépendance. Signals : `selectedDay = signal(new Date().toISOString().slice(0,10))` (ISO, jour courant par défaut), `poolSearchQuery = signal('')`, `poolReloadTrigger = signal(0)`, `challengesReloadTrigger = signal(0)`. `reloadPool()`/`reloadChallenges()` incrémentent leur trigger respectif.

**Pattern notable** : `rxResource` n'a pas de refetch trivial partagé — un compteur incrémenté observé comme `params` sert de mécanisme de "reload" déclenchable manuellement.

## `services/admin-api.service.ts` — orchestration `rxResource` + délégation

`@Injectable()`. Injecte `AdminHttpService` (`http`) + `AdminStateService` (`state`).

Signals délégués tels quels : `authenticated = http.authenticated`, `selectedDay = state.selectedDay`, `poolSearchQuery = state.poolSearchQuery`.

**4 `rxResource`** :
1. **`poolSearchResource`** — `params: () => state.poolSearchQuery()`. `stream` : si `q.length<2` → `of([])` ; sinon `timer(300).pipe(switchMap(() => http.searchDeezer(q)))` — **debounce 300ms implémenté manuellement** via `timer`+`switchMap` (le `switchMap` annule aussi la requête précédente si la query change avant les 300ms). Exposé : `poolSearchResults`, `poolSearchLoading`.
2. **`poolTracksResource`** — `params: () => state.poolReloadTrigger()` (redéclenché uniquement sur `reloadPool()`, pas de polling). `stream: () => http.getPoolTracks()`. Exposé : `poolTracks`, `poolTracksLoading`.
3. **`statsResource`** — `params: () => state.selectedDay()`. `stream: ({params: day}) => http.getStats(day)`. Exposé : `adminStats`, `statsLoading`.
4. **`challengesResource`** — `params: () => state.challengesReloadTrigger()`. `stream: () => http.getChallenges()`. Exposé : `challenges` (pas de `challengesLoading` exposé).

Méthodes : `checkAuth()`/`logout()` délèguent à `http`. `login(password)` délègue puis `.then(() => reloadAll())` — **après connexion réussie, recharge tout**. `reloadPool()` délègue à `state.reloadPool()`. `reloadStats()` appelle directement `statsResource.reload()` (API native, contrairement au pool/défis qui passent par un trigger de state). `reloadAll()` = `state.reloadChallenges()` + `state.reloadPool()` + `reloadStats()`. `generateToday/resetToday/refreshPreviews/addTrack/updateTrack/deleteTrack/updateTrackCooldownDays` → délégation pure à `AdminHttpService`, `Observable` brut (mise à jour d'état et reload laissés aux consommateurs : `AdminActionsService`/`AdminPoolService`).

*(Spec `admin-api.service.spec.ts` : un bloc teste en réalité `AdminHttpService` directement via `HttpTestingController` — nom trompeur — et un bloc `— delegation` vérifie le trio réel `AdminHttpService/AdminStateService/AdminApiService`.)*

## `services/admin-stats.service.ts` — dashboard + navigation mois/jour

`@Injectable()`. Injecte `AdminApiService` (`api`). Signals délégués : `adminStats`, `statsLoading`, `selectedDay`, `challenges`.

Signals propres : `expandedChallenges = signal<Set<number>>(new Set())` (défis dépliés), `challengeMonth = signal('YYYY-MM')` (mois affiché, défaut = mois courant).

**`effect()` constructeur** : synchronise `challengeMonth` avec les mois réellement disponibles (union triée desc de `challengeMonths()` et `challengeListMonths()`) — si le mois courant n'est dans aucune liste et qu'il y a des mois disponibles, bascule automatiquement sur le plus récent. Évite un mois vide au chargement initial.

Computed clés : `totalPlayers`/`maxDailyPlayers` (sur `dailyActivity`), `challengeListMonths`/`challengeMonths` (mois uniques triés desc — **attention**, `challenges()` a `date: string` alors que `adminStats()?.challenges` a `c.date` en `Date` réel, d'où deux calculs différents `date.slice(0,7)` vs `new Date(c.date).toISOString().slice(0,7)`), `challengesListForMonth`/`challengesForMonth` (filtres par mois pour "Historique" vs "Stats par défi"), `canGoPrevChallengeMonth`/`canGoNextChallengeMonth`.

Méthodes notables : `shiftChallengeMonth(delta)` — liste triée desc donc `next = idx - delta` (`delta=+1` = plus récent = index qui diminue). `toIso(d)` — corrige le fuseau horaire local pour un `Date` (`d.getTime() - d.getTimezoneOffset()*60000`) avant `toISOString()`, évite un décalage de jour. `shiftSelectedDay(delta)` — même logique inversée sur `availableDates` (`+1` = vers le passé). `activityBarHeightPx(count)` — `2px` si `max===0||count===0`, sinon `max(4, round(count/max*64))px`. Seuils couleur : `completionRateColor` (rouge<40, jaune<70, vert≥70), `rateColor`/`rateBarColor` (rouge<30, jaune<60, vert≥60 — seuils **différents** de `completionRateColor`, utilisés pour les taux artiste/titre par piste).

## `services/admin-pool.service.ts` — filtres/pagination/sélection/modales/audio preview

`@Injectable()`. Injecte `AdminApiService` (`api`), `SettingsService` (`settings`), `DestroyRef`.

**`poolPageSize = 15`** — taille de page du tableau unique fusionné available+used.

Signals filtres/pagination : `allTracksPage=0`, `poolFilterText=''`, `poolFilterStatus: 'all'|'available'|'used'`, `poolFilterPreview: 'all'|'ok'|'missing'`, `poolFilterLastUsedFrom/poolFilterLastUsedTo: string` (ISO `yyyy-MM-dd`, `''` = pas de borne), `poolSortColumn: PoolSortColumn|null`, `poolSortDirection: 'asc'|'desc'`, `selectedTrackIds = Set<number>`.
Signals modale ajout : `addToPoolStatus: 'idle'|'loading'|'success'|'error'`, `addModalOpen`, `addModalTrack: DeezerTrackInfo|null`, `addModalTrackIdToUpdate: number|null` (non-null = mode "remplacement d'un morceau sans preview" plutôt qu'ajout), `modalPlaying`, `modalProgress` (0-100).
Signals modale écoute (preview d'une ligne du pool) : `previewModalOpen`, `previewModalTrack: PoolTrackDto|null`, `previewModalStatus: 'loading'|'ready'|'error'`, `previewModalUrl` (privé). **Réutilise le lecteur audio de la modale d'ajout** (`modalAudio`/`modalPlaying`/`modalProgress`) — une seule instance `Audio()` partagée, les deux modales étant mutuellement exclusives à l'usage.
Signals modale suppression : `deleteModalOpen`, `deleteModalTracks: PoolTrackDto[]`, `deleteStatus: 'idle'|'loading'|'error'`.

**Computed** :
- `allTracks` — fusion `poolTracks().available` (`isAvailable:true`) + `.used` (`isAvailable:false, hasPreview:null` — non pertinent pour un morceau déjà utilisé).
- `filteredTracks` — applique les 3 filtres.
- `poolAvailableWithPreview` — nombre de morceaux disponibles **et** avec preview active (`hasPreview !== false`, donc inclut `true`/`null`/`undefined`), calculé depuis `poolTracks().available` **indépendamment des filtres UI**. *Mêmes critères que `DailyChallengeGenerator` côté back.*
- **`poolDaysRemaining`** : `Math.floor(poolAvailableWithPreview() / Math.max(1, settings.tracksPerChallenge()))` — jours restants avant épuisement du pool. `settings.tracksPerChallenge` = signal partagé (défaut `10`, synchronisé serveur), `Math.max(1,...)` protège la division par zéro. Testé : 7 dispo/preview ÷ 3 = `floor(7/3)=2`.
- `sortedTracks` — `filteredTracks()` trié selon `poolSortColumn`/`poolSortDirection` (`sortValue(track, column)` mappe chaque colonne triable : texte en `toLowerCase()`, `preview` en `2/1/0` selon `true/null/false`, `status` en `1/0`, dates/`usageCount` en valeur brute). **Nulls (`lastUsedDate`/`unlockDate` absents) toujours en dernier, quelle que soit la direction** — évite qu'un morceau "jamais utilisé" saute en tête sur un tri descendant.
- `allTotalPages`/`pagedAllTracks` — pagination classique sur `sortedTracks()` (pas `filteredTracks()` — seule la source de la slice paginée change, le compteur affiché reste basé sur `filteredTracks().length`).

Méthodes : `poolDaysColor(days)` — rouge<3, orange<7, vert≥7. `setPoolFilter*`/`setPoolFilterLastUsedFrom`/`setPoolFilterLastUsedTo` — **remettent systématiquement `allTracksPage` à 0**. `setPoolSort(column)` — même colonne → bascule `asc`/`desc` ; nouvelle colonne → `asc`. `onPoolSearchChange(q)` — met à jour `poolSearchQuery` (déclenche le `rxResource` recherche Deezer) + reset page. `toggleSelection`/`clearSelection` — sélection multiple (nouvelle `Set` à chaque mutation). `openAddModal(track, trackIdToUpdate=null, prefillSearch='')` — arrête l'audio, reset statut/progression, pré-remplit la recherche si fournie (bouton "Actualiser" du pool-tab). `toggleModalPreview()` / `togglePreviewModalAudio()` — lecture/pause preview 30s, délèguent au privé `togglePreviewUrl(url)` (une instance `Audio()` + boucle `requestAnimationFrame` pour `modalProgress`, helpers `pauseModalAudio`/`stopModalAudio`). `openPreviewModal(t: PoolTrackDto)` — ouvre la modale d'écoute : `api.searchDeezer("artist title")`, prend le résultat dont `deezerTrackId` correspond (sinon le premier), joue son `previewUrl` directement ; pas de preview trouvée → statut `error`. `closePreviewModal()` — stoppe l'audio + reset. `addToPoolFromModal(andClose)` — `api.addTrack(...)` si `addModalTrackIdToUpdate()===null` sinon `api.updateTrack(id,...)`. Succès → `api.reloadPool()`, ferme direct si `andClose` sinon timer 2s retour `idle`. Erreur → timer 3s retour `idle`. `openDeleteModal(track|null)` — `null` = suppression groupée des `selectedTrackIds()` filtrés sur `available` uniquement (**jamais** les `used`). `confirmDelete()` — `Promise.all` d'un `deleteTrack` par morceau, succès → `api.reloadPool()`.

## `services/admin-actions.service.ts` — génération/reset/refresh

`@Injectable()`. Injecte `AdminApiService` (`api`), `DestroyRef`.

Injecte aussi `SettingsService` (`settings`, `core/services/`).

Signals : `generateStatus: 'idle'|'loading'|'success'|'already'|'pool_insufficient'|'error'`, `resetStatus: 'idle'|'loading'|'success'|'error'`, `resetResult: ResetResult|null`, `refreshPreviewsStatus: 'idle'|'loading'|'success'|'error'`, `refreshPreviewsResult: RefreshPreviewsResult|null`, `trackCooldownDaysInput: number|null` (`null` = pas encore édité, l'input affiche alors `settings.trackCooldownDays()`), `updateCooldownStatus: 'idle'|'loading'|'success'|'error'`.

- `generateToday()` : succès → `'success'` + **`api.reloadAll()`** (un nouveau défi consomme du pool + crée stats/challenge) ; erreur → `409`→`'already'`, `422`→`'pool_insufficient'`, sinon `'error'` ; retour `idle` après 3s dans tous les cas (timer annulé/relancé proprement).
- `reset()` : succès → stocke `ResetResult`, **`api.reloadStats()`** (pas `reloadAll` — seules les stats sont affectées).
- `refreshPreviews()` : succès → stocke le résultat, **`api.reloadPool()`** (modifie potentiellement `hasPreview`).
- `updateTrackCooldownDays(days)` : succès → `'success'` + **`settings.load().subscribe()`** (recharge `/api/settings` pour resynchroniser `SettingsService.trackCooldownDays` — pas `api.reloadAll()`, ce setting n'affecte ni le pool ni les stats déjà affichés) ; erreur → `'error'` ; retour `idle` après 3s dans les deux cas.

Spec (`actions-tab.component.spec.ts`) : couvre la lecture de `settings.trackCooldownDays()` et le succès/erreur d'`updateTrackCooldownDays`. Pas de spec pour `AdminActionsService` au-delà de ça.

## Composants (tous présentationnels, injectent leur(s) service(s) directement)

- **`admin-login`** : `password` (propriété simple, `ngModel`), `loginStatus: 'idle'|'loading'|'error'`. `login()` → `api.login(password)`.
- **`dashboard-tab`** : injecte `AdminStatsService` seul. Template : sélecteur de jour (`shiftSelectedDay`), KPIs du jour (`adminStats['selectedDayKpis']` — bracket notation, type généré `[key:string]:any`), graphique barres 30j (`activityBarHeightPx`, clic → `selectDay`), tuiles répartition joueurs (`playerBreakdown`). La tuile **« Non terminés »** affiche `abandonedCount + expiredCount` avec un sous-titre `{abandoned} abandon · {expired} inachevé` (clé i18n `admin.dashboard.unfinishedBreakdown`) — les deux buckets `DailyKpisDto` sont distincts : `abandonedCount` = clic « Abandonner », `expiredCount` = sortie sans terminer (+ Pending d'un jour passé). `pendingCount` (en cours, jour courant) existe dans le DTO mais n'a pas de tuile dédiée.
- **`challenges-tab`** — grille par track dans « Stats par défi » : 4 tuiles (`artistCorrectRate`, `titleCorrectRate`, `extendedRate`, `avgListenedSeconds`). `extendedRate` (`TrackStatsDto.extendedRate`, % de réponses avec `WasExtended=true`) affiché en texte simple, sans code couleur (les seuils `rateColor`/`rateBarColor` sont calibrés pour des taux de réussite, pas pour un taux de prolongation dont une valeur haute n'est ni bonne ni mauvaise en soi).
- **`pool-tab`** : injecte `AdminPoolService`. Monte `<app-add-track-modal/>`, `<app-delete-track-modal/>` et `<app-preview-track-modal/>` en bas du template (toujours dans le DOM dès l'onglet actif, masquées par leur `@if` interne). Tableau fusionné, checkbox de sélection uniquement sur non-`used`, bouton "Actualiser" par ligne sans preview → `openAddModal(null, t.id, "artist title")`. **Toutes les colonnes sont triables** (clic sur l'en-tête → `pool.setPoolSort(column)`, flèche ▲/▼ affichée sur la colonne active), **colonnes réordonnées** : `Actions` en 2ᵉ position (après la case à cocher de sélection, avant Artiste) ; boutons par ligne non-`used` : `▶` (`openPreviewModal(t)` — écoute), `↻ Actualiser` (si `hasPreview === false`), `🗑`. Colonnes `LastUsedDate`/`UnlockDate`/`UsageCount` en fin de tableau (cellule vide si `null`), filtre par plage de dates (`type="date"`) sur `LastUsedDate` en plus des filtres texte/statut/preview existants.
- **`challenges-tab`** : injecte `AdminStatsService` (**même instance** que dashboard-tab) **et**, directement, `PlayerIdentityService`/`ClipboardService` (`core/services/`) — deuxième composant de la feature (après `actions-tab`/`SettingsService`) à injecter un service `core/` en direct, ici pour comparer l'ID du navigateur courant aux joueurs listés. Un seul navigateur de mois pilote deux sections aux sources différentes : "Stats par défi" (`adminStats().challenges`, type généré) et "Historique" (`challenges()`, type local) — synchronisées via l'`effect()` d'`AdminStatsService`. Sous chaque ligne de « Stats par défi », un chip par joueur (`c.players`, toutes sessions Completed/Pending/Abandoned/Expired) affiche les 8 premiers caractères du `PlayerId`. **Couleur de fond/bordure/texte = teinte HSL déterministe dérivée de l'ID** (`idHue`/`idBg`/`idBorder`/`idText`, hash `h = h*31 + charCode`) : un même joueur garde la même couleur d'un défi à l'autre → repérage visuel des habitués. Le **statut** (hors `Completed`) est rendu par un petit point coloré en tête de chip (`statusColor` : Abandoned = ambre, Expired = gris, Pending = faint). Interactions : **clic gauche** = `selectPlayer()` → surbrillance (`box-shadow`) de tous les chips du même ID sur tous les défis affichés + les autres passent à `opacity 0.3` (`isHighlighted`/`isDimmed`, signal `highlightedPlayerId`, re-clic ou autre chip = bascule) ; **clic droit** = `onChipContextMenu()` → `preventDefault` + `copyPlayerId()` (copie l'ID complet via `ClipboardService`, feedback "copié" 1,5s sur le chip via `copiedPlayerId`). Surbrillance + libellé « toi » automatiques (`isYou()`) si l'ID correspond à `PlayerIdentityService.playerId()` (prioritaire sur la teinte HSL).
- **`actions-tab`** : injecte `AdminActionsService` **et** `SettingsService` (seul composant de la feature à injecter un service `core/` directement, pour lire la valeur courante de `trackCooldownDays` avant édition). 4 blocs (génération/reset/refresh previews/cooldown) avec messages conditionnels par statut. Le bloc cooldown utilise un `<input type="number">` avec événements DOM bruts (`(input)`/`$any($event.target).value`), pas `ngModel` — cohérent avec le pattern déjà utilisé par les filtres de `pool-tab` plutôt que d'introduire `FormsModule` dans ce composant.
- **`add-track-modal`** / **`delete-track-modal`** / **`preview-track-modal`** : injectent `AdminPoolService`, zéro logique propre — pur reflet des signals du service (`@if (pool.addModalOpen())` / `deleteModalOpen()` / `previewModalOpen()`, overlay + `Escape` pour fermer). `preview-track-modal` : `@switch (pool.previewModalStatus())` → spinner / erreur / lecteur (bouton `▶`/`⏸` + barre `modalProgress`, mêmes classes que le lecteur de `add-track-modal`).

## Constantes à connaître

| Valeur | Emplacement | Rôle |
|---|---|---|
| `15` | `AdminPoolService.poolPageSize` | lignes par page tableau pool |
| `'admin_token'` | `AdminHttpService.storageKey` | clé localStorage du token admin |
| `300ms` / `2` car. | `AdminApiService` (recherche Deezer) | debounce manuel `timer`+`switchMap` / seuil avant appel réseau |
| `2000ms` / `3000ms` | `AdminPoolService.addToPoolFromModal` | retour `idle` après succès / erreur ajout pool |
| `3000ms` | `AdminActionsService.generateToday`/`updateTrackCooldownDays` | retour `idle` (succès et erreur) |
| `1500ms` | `ChallengesTabComponent.copyPlayerId` | feedback "copié" sur le chip joueur cliqué |
| `2000ms` | `BrowserIdComponent.copy` | feedback "copié" sur le bouton copier l'ID navigateur |
| défaut `10` | `SettingsService.tracksPerChallenge` | dénominateur de `poolDaysRemaining` |
| défaut `30` | `SettingsService.trackCooldownDays` | valeur affichée dans l'input avant première édition |
| rouge<3 / orange<7 / vert≥7 | `poolDaysColor` | autonomie du pool |
| rouge<40 / jaune<70 / vert≥70 | `completionRateColor` | taux de complétion |
| rouge<30 / jaune<60 / vert≥60 | `rateColor`/`rateBarColor` | taux artiste/titre par piste (seuils différents de `completionRateColor`) |

## Points d'attention pour un futur agent

1. **Ne pas ajouter d'`@Input`/`@Output`** dans cette feature sans bonne raison — le pattern établi est service-as-store scopé à `AdminComponent`. Un nouvel état partagé va dans un des 6 services existants (ou un nouveau service fourni au même niveau), pas en prop-drilling. **Exception tolérée** : injecter un service `core/` (root, hors des 6 services scopés) directement dans un composant quand l'état est global à l'app et non spécifique à l'admin — précédent `actions-tab`/`SettingsService`, repris par `challenges-tab`/`PlayerIdentityService`+`ClipboardService`.
2. **`ChallengeDto` local vs généré** — vérifier systématiquement lequel des deux types est importé (`../admin.models` vs `api/api.generated`) avant de manipuler `date`.
3. **`logout()` ne fait pas d'appel serveur** — purement local (localStorage). Si un jour une invalidation côté back est nécessaire, elle n'existe pas aujourd'hui.
4. Après toute mutation du pool (ajout/suppression/update), le reload passe toujours par `api.reloadPool()` — jamais de mutation optimiste locale des signals `poolTracks`.
5. **`PoolTrackDto.unlockDate` est calculée côté back, jamais stockée** — dépend de `TrackCooldownDays` au moment de l'appel `GET /api/admin/tracks`. Ne pas essayer de la dériver côté front depuis `lastUsedDate` + une constante locale : `settings.trackCooldownDays()` peut être désynchronisé jusqu'au prochain `settings.load()`.

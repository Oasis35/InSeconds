# Architecture Frontend (Angular 22)

> Référence d'architecture frontend InSeconds. Reflète l'état du code à `src/front/InSeconds.Client/`. Pour les conventions et pièges connus, voir [`CLAUDE.md`](../CLAUDE.md).

## Stack

- **Angular 22** (CLI 22.0.x, standalone components + signals)
- **TypeScript 6.0**
- **Tailwind CSS v4** via `@tailwindcss/postcss` dans `.postcssrc.json`
- **SCSS** : `@use "tailwindcss";` en haut de `src/styles.scss` (PAS `@import`). Variables CSS dans `:root` pour la palette couleurs (voir section Palette).
- **ngx-translate v18** (`@ngx-translate/core` + `@ngx-translate/http-loader`) — i18n FR/EN, fichiers `public/i18n/{fr,en}.json`, `TranslatePipe` dans chaque composant
- **NSwag 14.7.1** : génération du client TypeScript depuis l'OpenAPI back (`npm run generate-api`)
- **Port front pinné à 5173** (évite le conflit avec d'autres projets sur 4200)

## Structure dossiers

```
src/front/InSeconds.Client/
├── public/
│   └── i18n/
│       ├── fr.json                         # traductions FR (source de vérité)
│       └── en.json                         # traductions EN
├── nswag.json                              # config génération client TS depuis OpenAPI
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── api.generated.ts           # ⚠️ GÉNÉRÉ — ne pas éditer manuellement
│   │   ├── core/
│   │   │   ├── guards/
│   │   │   │   └── unsaved-game.guard.ts   # CanDeactivate : confirme la sortie en cours de partie
│   │   │   ├── interceptors/
│   │   │   │   ├── player-auth.interceptor.ts  # withCredentials: true sur /api (hors /admin)
│   │   │   │   └── admin-auth.interceptor.ts   # Bearer token sur /api/admin
│   │   │   ├── models/
│   │   │   │   └── game.models.ts         # re-exports depuis api.generated.ts
│   │   │   └── services/
│   │   │       ├── audio-player.service.ts    # signal-based, durée choisie
│   │   │       ├── clipboard.service.ts        # copy(text): Promise<boolean>, mutualisé game/admin
│   │   │       ├── game.service.ts             # POST /sessions + /answers
│   │   │       ├── language.service.ts         # détection/changement FR/EN, persist localStorage
│   │   │       ├── player-session.service.ts   # GET /players/me → isGuest/email/pseudo (root, appelé au boot)
│   │   │       └── settings.service.ts         # GET /settings → signals
│   │   ├── shared/
│   │   │   ├── confirm-sheet/
│   │   │   │   └── confirm-sheet.component.ts  # bottom-sheet de confirmation réutilisable
│   │   │   ├── share-button/
│   │   │   │   └── share-button.component.ts   # bouton partage réutilisable (already-played + done)
│   │   │   ├── browser-id/
│   │   │   │   └── browser-id.component.ts     # ID court du navigateur + bouton copier (login + shell admin)
│   │   │   ├── decor-background/
│   │   │   │   └── decor-background.component.ts # décor DA (grille/scanlines) en arrière-plan
│   │   │   ├── guess-time-chart/
│   │   │   │   └── guess-time-chart.component.ts # histogramme temps de réponse réutilisable
│   │   │   ├── track-results-list/
│   │   │   │   └── track-results-list.component.ts # liste de morceaux + pop-up histogramme (récap + déjà joué)
│   │   │   └── deezer-badge.component.ts       # badge "À écouter sur Deezer" (fichier plat, sans sous-dossier)
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   │   ├── admin.component.ts          # shell (~45 lignes) — injecte les 7 services
│   │   │   │   ├── admin.models.ts             # interfaces partagées (TrackDto, ChallengeDto, …)
│   │   │   │   ├── services/
│   │   │   │   │   ├── admin-http.service.ts   # HTTP brut + signal authenticated + login/logout/checkAuth
│   │   │   │   │   ├── admin-state.service.ts  # signals partagés (selectedDay, activeTab + visitedTabs, poolReloadTrigger, …)
│   │   │   │   │   ├── admin-api.service.ts    # 6 rxResource (pool, stats, challenge-stats, challenges, allowedEmails, search) — chargement paresseux par onglet
│   │   │   │   │   ├── admin-stats.service.ts  # état dashboard + onglet Défis (navigation, formatage dates, …)
│   │   │   │   │   ├── admin-pool.service.ts   # filtres/pagination/sélection pool, modales ajout/suppression
│   │   │   │   │   ├── admin-actions.service.ts # generateToday(), reset(), refreshPreviews(), sendTestEmail()
│   │   │   │   │   └── admin-allowed-emails.service.ts # add(), remove() whitelist
│   │   │   │   └── components/
│   │   │   │       ├── admin-login/
│   │   │   │       ├── dashboard-tab/
│   │   │   │       ├── pool-tab/
│   │   │   │       ├── challenges-tab/
│   │   │   │       ├── allowed-emails-tab/     # whitelist admin (comptes utilisateurs)
│   │   │   │       ├── actions-tab/
│   │   │   │       ├── add-track-modal/
│   │   │   │       └── delete-track-modal/
│   │   │   ├── game/
│   │   │   │   ├── game.component.ts           # orchestration session — ~370 lignes
│   │   │   │   ├── game.component.html         # ~110 lignes (délègue aux sous-composants)
│   │   │   │   ├── services/
│   │   │   │   │   ├── game-facade.service.ts      # façade métier (fournie par GameComponent, pas root)
│   │   │   │   │   └── deezer-autocomplete.service.ts  # autocomplete Deezer (providedIn: root, stateless)
│   │   │   │   ├── blind-round/
│   │   │   │   │   └── blind-round.component.ts  # choix palier + lecture + saisie + polish UX
│   │   │   │   ├── components/
│   │   │   │   │   ├── game-header/            # en-tête (titre + streak + score + barre progression)
│   │   │   │   │   └── game-footer/            # pied de page (liens admin/confidentialité/connexion + langue FR/EN)
│   │   │   │   └── screens/
│   │   │   │       ├── welcome-screen/
│   │   │   │       ├── resume-screen/
│   │   │   │       ├── status-screen/          # handles no_challenge + error (titleKey/bodyKey)
│   │   │   │       ├── already-played-screen/
│   │   │   │       └── final-recap-screen/     # exporte aussi RoundResult
│   │   │   ├── login/                          # connexion par magic link (comptes utilisateurs)
│   │   │   │   ├── request/                    # /login — demande de lien + connexion rapide dev
│   │   │   │   └── verify/                     # /login/verify — confirmation explicite + choix pseudo
│   │   │   ├── not-found/
│   │   │   ├── privacy/                       # page confidentialité (routes /privacy + /confidentialite)
│   │   │   └── service-down/
│   │   ├── app.config.ts                  # providers globaux
│   │   ├── app.routes.ts                  # routes
│   │   └── app.ts                         # composant racine + polling /health
│   ├── environments/
│   │   ├── environment.ts                 # prod (apiUrl + appUrl Northflank)
│   │   └── environment.development.ts     # dev (apiUrl http://localhost:5171, appUrl http://localhost:5173)
│   └── styles.scss                        # Tailwind + variables CSS :root + keyframes globaux
├── angular.json                           # port 5173, fileReplacements dev/prod
└── package.json
```

## `app.config.ts` — providers globaux

```typescript
providers: [
  provideHttpClient(withFetch(), withInterceptors([playerAuthInterceptor, adminAuthInterceptor])),
  { provide: API_BASE_URL, useValue: environment.apiUrl },
  ApiClient,
  provideAppInitializer(() => inject(SettingsService).load()),
  provideAppInitializer(() => inject(LanguageService).init()),
  provideAppInitializer(() => inject(PlayerSessionService).load()),
  provideTranslateService({ loader: provideTranslateHttpLoader({ prefix: 'i18n/', suffix: '.json' }) }),
]
```

- `playerAuthInterceptor` passe avant `adminAuthInterceptor` — ordre important
- `LanguageService.init()` détecte la langue (`localStorage` → `navigator.language` → FR) et appelle `translate.use()`

## Palette CSS — variables `:root`

Toutes les couleurs sont centralisées dans `styles.scss` sous `:root` et utilisées via `var(--...)` dans les templates. Ne jamais remettre de valeurs hex en dur dans les templates.

| Variable | Valeur | Usage |
|---|---|---|
| `--bg-page` | `#080810` | fond de page |
| `--bg-surface` | `#0f0f1a` | cartes, zones player |
| `--bg-surface-2` | `#1a1a2e` | placeholder pochettes |
| `--bg-inactive` | `#1e1e2e` | boutons secondaires, barres vides |
| `--bg-primary` | `#6366f1` | boutons primaires, accent indigo |
| `--bg-primary-dk` | `#312e81` | fond indigo foncé (tooltip paliers) |
| `--bg-danger` | `#ef4444` | bouton abandon |
| `--bg-warn` | `#92400e` | fond avertissement |
| `--text-hi` | `#f8fafc` | titres, valeurs importantes |
| `--text-body` | `#e2e8f0` | texte corps |
| `--text-muted` | `#475569` | texte discret |
| `--text-faint` | `#334155` | texte très discret, labels |
| `--text-sep` | `#1e293b` | séparateurs |
| `--text-accent` | `#6366f1` | logo InSeconds |
| `--text-streak` | `#f59e0b` | streak feu |
| `--text-error` | `#fca5a5` | erreurs texte |
| `--text-hover` | `#64748b` | hover liens, valeurs stats |
| `--text-slate` | `#94a3b8` | boutons secondaires |
| `--text-light` | `#cbd5e1` | réponse correcte |
| `--text-indigo` | `#c7d2fe` | texte indigo clair |
| `--color-success` | `#34d399` | ✓ artiste/titre correct |
| `--color-fail` | `#f87171` | ✗ artiste/titre incorrect |
| `--color-warn` | `#fbbf24` | avertissement (confirm vide) |
| `--border-subtle` | `rgba(255,255,255,0.06)` | bordures légères |
| `--border-medium` | `rgba(255,255,255,0.07)` | bordures medium |
| `--border-strong` | `rgba(255,255,255,0.08)` | bordures fortes |
| `--overlay-dark` | `rgba(0,0,0,0.7)` | overlay modale |

## i18n — ngx-translate

`LanguageService` (`core/services/language.service.ts`) gère la langue active :
- Détection : `localStorage('lang')` → `navigator.language` → `'fr'` (fallback)
- `use(lang)` : appelle `translate.use(lang)`, met à jour `localStorage` et `document.documentElement.lang`
- Signal `current` exposé pour les composants qui veulent réagir au changement
- **Changement manuel** : bouton dans `GameFooterComponent` (globe monochrome + code `FR`/`EN`), toggle FR ↔ EN via `use()`. Tooltip `footer.language` libellé dans la langue cible (« Switch to English » côté FR)

Fichiers de traduction dans `public/i18n/`. Structure des clés : `common`, `header`, `welcome`, `resume`, `blindRound`, `done`, `alreadyPlayed`, `share`, `footer`, `noChallenge`, `error`, `serviceDown`, `notFound`, `abandonSheet`, `leaveSheet`, `privacy`, `admin.*`.

**E2E** : `e2e/fixtures/test.ts` force `localStorage.setItem('lang', 'fr')` via `addInitScript` pour que les specs matchent le texte FR.

## NSwag — client TypeScript généré

`nswag.json` pointe sur `http://localhost:5171/openapi/v1.json` et génère `src/app/api/api.generated.ts` avec la classe `ApiClient` + tous les types DTO.

```bash
# Regénérer après un changement d'endpoint ou de DTO back :
docker compose up -d           # s'assurer que le back tourne avec le nouveau code
npm run generate-api           # runtime Net100
npm run build                  # vérifier que le build TypeScript passe
```

`api.generated.ts` **est commité** — le backend ne tourne pas en CI donc la génération ne peut pas s'y faire automatiquement. Les composants et services importent les types via `game.models.ts` qui re-exporte depuis le fichier généré.

## Services

### `SettingsService`

Charge les settings de la BD au boot, expose des signals :

```typescript
readonly allowedDurations = signal<number[]>([0.5, 1, 1.5, 2, 3, 5, 10]);
readonly guessTimerSeconds = signal(20);
readonly tracksPerChallenge = signal(3);
readonly durationScores = signal<Record<number, number>>({});
```

`load()` fait un `catchError` : si `/api/settings` est indisponible au boot, l'app démarre quand même avec les valeurs par défaut des signals (mêmes défauts que le back), `console.warn` seulement.

### `AudioPlayerService`

Modèle "durée choisie" : l'utilisateur choisit le palier AVANT d'écouter, l'audio joue exactement cette durée puis s'arrête automatiquement. Prolongations libres et chaînables, sans limite de nombre, jusqu'au dernier palier configuré.

Signals exposés : `state` (`idle | loading | playing | finished`), `listenedSeconds`, `extended`, `progress` (0→1, mis à jour via `requestAnimationFrame` pour la barre de progression live).

Méthodes publiques :
- `play(trackUrl, durationSeconds)` — charge et joue l'audio pour la durée choisie
- `extend(nextDurationSeconds)` — prolonge jusqu'au palier suivant, **chaînable sans limite** (le setting `MaxExtensionsPerAnswer` a été supprimé, cf. [`GAMEPLAY_RULES_FR.md`](GAMEPLAY_RULES_FR.md)). Comportement dual : si l'audio est **en cours de lecture**, continue depuis `audio.currentTime` (pas de replay, juste un reschedule de l'arrêt automatique) ; sinon (palier précédent déjà terminé, ou `idle`), **relit depuis le début** jusqu'au nouveau palier. Pose `wasExtended=true` dans les deux cas (stocké pour les stats admin, sans effet sur le score). Appelé depuis `BlindRoundComponent.listenMore()`
- `stop()` — arrête et retourne `{ listenedSeconds, wasExtended }`
- `reset()` — nettoie tout (appelé dans `ngOnDestroy` de `BlindRoundComponent`)
- `replayFull()` — rejoue depuis le début jusqu'à la fin naturelle (30s), sans timer
- `preloadAll(trackUrls)` — injecte des `<link rel="preload" as="audio">` dans le `<head>`, non bloquant

### `DeezerAutocompleteService`

Autocomplete Deezer (`features/game/services/`, `providedIn: root`, stateless) : prend un `Observable<string>`, applique debounce 300ms + distinctUntilChanged, appelle `GET /api/deezer/search?q=xxx` (proxy back pour éviter les CORS), retourne `DeezerSuggestion[]` (`artist`, `title`). Les suggestions sont déjà nettoyées et dédupliquées côté back (`SearchEndpoint.CleanAndDeduplicate`, cf. `BACKEND_STRUCTURE_FR.md`) — le service ne fait aucun traitement supplémentaire.

### `GameService`

```typescript
peekToday(): Observable<GetTodaySessionResponse>   // GET /api/sessions/today — lecture seule, ne crée NI session NI cookie
startToday(): Observable<StartSessionResponse>      // POST — crée Player + cookie + session (clic « Commencer »/« Reprendre » uniquement)
submitAnswer(sessionId: number, body: SubmitAnswerRequest): Observable<SubmitAnswerResponse>
abandonSession(sessionId: number): Observable<void>
updateListening(sessionId: number, trackId: number, duration: number): Observable<void>
```

`game.component.ngOnInit` appelle `peekToday()` (via `GameFacadeService`) et mappe `res.state` → `welcome` / `resume_prompt` / `already_played` / `no_challenge`. `POST /api/sessions` n'est déclenché que par `beginGame()` / `beginResume()` / `beginAbandonFromResume()`.

### `LanguageService`

```typescript
readonly current = signal<Lang>('fr');
init(): void          // appelé au boot via provideAppInitializer
use(lang: Lang): void // change la langue, persiste en localStorage
```

### `ClipboardService`

```typescript
copy(text: string): Promise<boolean>  // wrapper navigator.clipboard.writeText, ne rejette jamais
```

`providedIn: 'root'`. Mutualise la copie presse-papier entre `GameComponent` (partage de score) et `admin/` (`BrowserIdComponent`, `ChallengesTabComponent` — copie de l'ID joueur/navigateur).

### `PlayerSessionService`

```typescript
readonly playerId = signal<string | null>(null);
readonly isGuest = signal(true);
readonly email = signal<string | null>(null);
readonly pseudo = signal<string | null>(null);
readonly isLinked = computed(() => !this.isGuest());

load(): Observable<void>;   // GET /api/players/me — appelé via provideAppInitializer
logout(): Observable<void>; // POST /api/auth/logout
```

`providedIn: 'root'`. **Remplace l'ancien `player-identity.service.ts`** (comptes utilisateurs, 2026-08) : en plus de l'ID navigateur (usage admin, `isYou()`), expose l'état de connexion (guest vs compte lié) consommé par l'icône de connexion du footer (`GameFooterComponent`) et les écrans `/login`. `load()` est appelé une fois au boot via `provideAppInitializer` (`app.config.ts`, même pattern que `SettingsService`) — **conséquence** : contrairement au reste de l'app (création paresseuse du `Player`), `GET /api/players/me` crée un `Player` guest dès la première page vue, même pour un visiteur qui ne joue jamais (cf. `CookieAuthService`/`GetCurrentPlayerEndpoint` côté back). Le cookie `authToken` étant `HttpOnly` et chiffré (Data Protection back), ces informations sont structurellement illisibles côté client sans cet appel.

## Composants

### `GameComponent`

Orchestre une session complète. États : `loading` → `welcome` → `playing` → `done` (+ `resume_prompt`, `already_played`, `no_challenge`, `error`).

Délègue l'affichage à des sous-composants :
- **`GameHeaderComponent`** : titre InSeconds + streak + score en cours + barre de progression + bouton abandon
- **`GameFooterComponent`** : liens admin / confidentialité + bouton langue FR/EN
- **`WelcomeScreenComponent`** : état `welcome`
- **`ResumeScreenComponent`** : état `resume_prompt` (avec confirmation abandon inline)
- **`StatusScreenComponent`** : états `no_challenge` + `error` (inputs `titleKey`/`bodyKey` i18n)
- **`AlreadyPlayedScreenComponent`** : état `already_played` (score vs médiane, `ShareButtonComponent`). L'accordéon morceaux délègue à `<app-track-results-list [rows]="playedRows()">` (mappe `stats().tracks`) → **mêmes lignes que le récap** (chips `✓/✗`, durée, `+score` cliquable → pop-up histogramme)
- **`FinalRecapScreenComponent`** : état `done` (score animé, `ShareButtonComponent`). Input `stats: TodayStatsResponse | null` (`GameComponent` appelle `apiStatsToday()` en entrant dans `done`). L'accordéon délègue à `<app-track-results-list [rows]="recapRows()">` — `recapRows` mappe `results()` (`RoundResult`) + fusionne l'histogramme depuis `stats` par `position`. Liste + pop-up rendues par `TrackResultsListComponent`
- **`BlindRoundComponent`** : état `playing`
- **`ConfirmSheetComponent`** : modales abandon + quitter

**Confirmation de sortie** : implémente `UnsavedGameComponent` (`canDeactivate()`). Si `gameState() === 'playing'`, ouvre une modale et renvoie une `Promise<boolean>`. `@HostListener('window:beforeunload')` couvre la fermeture d'onglet.

### `BlindRoundComponent`

Layout B — deux zones toujours présentes :
- **Zone player** : paliers au départ, puis bouton Replay + "Écouter jusqu'à Xs" + barre de progression live + chrono
- **Zone saisie** : champ unique `"Artiste - Titre"` avec dropdown autocomplete Deezer (debounce 300ms), navigable au clavier (↓/↑/Entrée/Échap, `onSearchKeydown` + signal `highlightedIndex`), bouton Valider

Polish UX : `isSubmitting` (loading sur Valider), bouton `✕` lié à `(mousedown)`, tooltip paliers (`scoreForDuration`), score count-up (`countUp` rAF), toast erreur réseau (4s).

`setResult(r, isNetworkError?)` — méthode publique appelée depuis `GameComponent` via `viewChild`.

**Écran de révélation** : au lieu d'une ligne texte « Ton temps / Moy. / Pas trouvé », affiche `<app-guess-time-chart>` (`GuessTimeChartComponent`, sans `titleKey`, version compacte) alimenté par `r.guessTimeDistribution` + `r.notFoundCount` — colonne du palier écouté en surbrillance si le joueur a trouvé, sinon barre « ✗ » en surbrillance. Le bloc de révélation est resserré (`gap-3`, pochette `w-24`, score `2.25rem`) pour tenir dans un viewport mobile sans scroll.

### `GuessTimeChartComponent`

Histogramme réutilisable (`shared/guess-time-chart/`) : une barre par palier d'écoute (comptes de bonnes réponses) + une barre finale « ✗ » (`notFoundCount`). Inputs : `distribution: DurationBucketDto[]` (required), `notFoundCount?: number`, `highlightDuration?: number | null` (surbrillance de la colonne du joueur), `highlightNotFound?: boolean`, `titleKey?: string` (clé i18n du titre, masqué si vide), `showCounts?: boolean` (défaut `false` — affiche le nombre de joueurs au-dessus de chaque barre ; activé dans la vue admin). Aucun output — présentationnel pur (computed `buckets` : hauteurs relatives au max, couleurs). Rendu compact : barres fines de 14px arrondies (`rounded-full`), graphe borné à `max-width:210px` centré, hauteur ~36px (48px avec `showCounts`). Tokens couleur : `--color-violet` (barres paliers), `--color-accent-3` (surbrillance), `--color-fail` (barre « ✗ » sans surbrillance), `--text-faint` (labels). Utilisé sur l'écran de révélation du blind round, dans la pop-up de `TrackResultsListComponent` (récap final + « déjà joué », `showCounts=false`) et dans la pop-up de `ChallengesTabComponent` (onglet Défis admin, `showCounts=true`).

### `TrackResultsListComponent`

Liste accordéon des morceaux d'un défi + pop-up histogramme (`shared/track-results-list/`). Input unique `rows: TrackResultRow[]` (interface exportée : `position`, `artist`, `title`, `coverUrl`, `artistCorrect`/`titleCorrect`/`listenedDurationSeconds` **nullables** → chips `✓/✗` et durée masqués si `null`, `averageSecondsWhenCorrect`, `failureRatePercent`, `score` **nullable** → colonne score masquée si `null`, `deezerTrackId`, `guessTimeDistribution` **vide → score non cliquable**, `notFoundCount`). Chaque `+score` cliquable ouvre une pop-up plein écran (`openChart` signal, fermeture backdrop / ✕ / `Échap` via `@HostListener('document:keydown.escape')`) contenant `<app-guess-time-chart>` (`highlightDuration` = palier écouté si le joueur a trouvé, sinon `highlightNotFound`). Aucun output. Mutualisé entre `FinalRecapScreenComponent` (`recapRows`, à partir de `RoundResult` + `stats`) et `AlreadyPlayedScreenComponent` (`playedRows`, à partir de `TrackStat`). Le contour (carte, bouton « Voir les morceaux / Masquer ») reste géré par chaque écran.

### `ConfirmSheetComponent`

Bottom-sheet de confirmation réutilisable (`shared/confirm-sheet/`). Inputs : `title`, `body`, `tone` (`danger`/`warning`), `confirmLabel`, `cancelLabel`, `loading`, `confirmStyle`, `cancelStyle`. Outputs : `confirm`, `cancel`.

### `ShareButtonComponent`

Bouton partage réutilisable (`shared/share-button/`). Inputs : `copied: boolean`, `failed?: boolean`, `disabled?: boolean`. Output : `share`. Utilisé dans `AlreadyPlayedScreenComponent` et `FinalRecapScreenComponent`. Si `failed` est vrai (rejet de `clipboard.writeText` : permission refusée, contexte non sécurisé), le hint est remplacé par un message d'erreur (`share.failed`, signal `shareFailed` posé 3 s par `GameComponent.copyToClipboard()`).

### `BrowserIdComponent`

ID court (8 premiers caractères du `PlayerId`) + bouton copier (`shared/browser-id/`), aucun `@Input`/`@Output` — injecte lui-même `PlayerSessionService` + `ClipboardService`. Monté une seule fois dans `admin.component.html`, au-dessus du `@if (authenticated)` : visible aussi bien sur l'écran de login que dans le shell admin authentifié.

### `DecorBackgroundComponent`

Décor DA en arrière-plan (`shared/decor-background/`) — grille/scanlines.

### `DeezerBadgeComponent`

Badge officiel "À écouter sur Deezer" (`shared/deezer-badge.component.ts`), utilisé dans le récap final par morceau.

### `PrivacyComponent`

Page confidentialité (`features/privacy/`), route lazy `/privacy` + alias `/confidentialite` (redirect). Contenu entièrement via clés i18n `privacy.*`. Style éditorial : vouvoiement formel, l'utilisateur n'est jamais nommé (« l'éditeur du site »). Accessible depuis le lien bouclier du footer.

### `AdminComponent`

Shell ~45 lignes. Fournit les 6 services via `providers: [AdminHttpService, AdminStateService, AdminApiService, AdminStatsService, AdminPoolService, AdminActionsService]` au niveau du composant (pas `root`). Ordre des onglets : **Dashboard, Défis, Pool, Actions**. L'onglet actif vit dans `AdminStateService` (`activeTab` + `setActiveTab`), pas dans le shell.

**Chargement paresseux par onglet** (2026-08-29) : à l'ouverture de l'admin, seul `GET /api/admin/stats` (Dashboard, léger) part. Les `rxResource` de Pool (`/api/admin/tracks`) et Défis (`/api/admin/challenge-stats` + `/api/admin/challenges`) restent `idle` (`params → undefined`) tant que `http.authenticated()` est faux **ou** que l'onglet n'a pas été ouvert (`AdminStateService.hasVisited(tab)`, `Set` `visitedTabs` init `['dashboard']`). Un onglet reste « visité » toute la session → données chargées une fois puis cachées par le `rxResource`. Corollaire UI : les badges de compteur des onglets Pool/Défis n'affichent leur `(N)` qu'une fois l'onglet ouvert (`admin.tabs.poolPlain`/`challengesPlain` sinon).

Délègue à 7 sous-composants :

- **`AdminLoginComponent`** : formulaire login, `loginStatus` signal local
- **`DashboardTabComponent`** : injecte `AdminStatsService` — sélecteur de jour + KPIs, activité 30 jours, répartition joueurs
- **`PoolTabComponent`** : injecte `AdminPoolService`, contient `AddTrackModalComponent` + `DeleteTrackModalComponent` ; affiche l'**autonomie du pool** (« X jours de défis restants ») en ligne à côté du compteur disponible/utilisé
- **`ChallengesTabComponent`** : injecte `AdminStatsService` — **stats par défi** (`challengeStats()` = `GET /api/admin/challenge-stats`, chargé à l'ouverture de l'onglet ; accordéon médiane/min/max, taux artiste/titre par morceau ; guard `challengeStatsLoading()` → spinner) + historique des défis (`challenges()` = `GET /api/admin/challenges`), avec un navigateur ‹ Mois Année › unique en haut de l'onglet. Injecte aussi `PlayerSessionService`/`ClipboardService` directement (`core/`) pour afficher, sous chaque défi, un chip par joueur (`c.players`, toutes sessions) affichant `p.pseudo ?? shortId(p.playerId)` (pseudo pour un compte lié, ID tronqué en fallback pour un guest), cliquable pour copier l'ID complet, avec surbrillance + libellé « toi » automatiques si l'ID correspond au navigateur courant — repérer les joueurs qui reviennent
- **`ActionsTabComponent`** : injecte `AdminActionsService`
- **`AddTrackModalComponent`** : injecte `AdminPoolService`
- **`DeleteTrackModalComponent`** : injecte `AdminPoolService`

Services admin (`features/admin/services/`) :
- `AdminHttpService` — HTTP brut + signal `authenticated` + `login`/`logout`/`checkAuth`
- `AdminStateService` — signals partagés (`selectedDay`, `poolSearchQuery`, `poolReloadTrigger`, `challengesReloadTrigger`, `allowedEmailsReloadTrigger`) + pilotage des onglets (`activeTab`, `setActiveTab`, `hasVisited` sur le `Set` privé `visitedTabs`)
- `AdminApiService` — 6 rxResource (`poolSearch`, `poolTracks`, `stats`, `challengeStats`, `challenges`, `allowedEmails`) + computed accessors ; délègue HTTP à `AdminHttpService`, état à `AdminStateService`. **Chargement paresseux** : `poolTracks`/`challengeStats`/`challenges`/`allowedEmails` gardés sur `authenticated() && hasVisited(<onglet>)` (`params` retourne `undefined` tant que la condition n'est pas remplie, ce qui laisse la resource idle plutôt que de partir en 401 avant connexion) ; `stats` (Dashboard) gardé sur `authenticated()` seul. `challengeStats` et `challenges` partagent le trigger `challengesReloadTrigger` → `reloadAll()` / une génération de défi rafraîchit les deux
- `AdminStatsService` — état dashboard + onglet Défis (navigation jour/mois, formatage dates, accordéon stats par défi) ; `challengeMonths`/`challengesForMonth` dérivent de `challengeStats()` (Stats par défi) et `challenges()` (Historique)
- `AdminPoolService` — filtres, pagination, sélection multiple, état modales add/delete, lecteur preview ; computed `poolDaysRemaining` = `floor(disponibles avec preview ÷ tracksPerChallenge)` (mêmes critères que `DailyChallengeGenerator`, calculé depuis `poolTracks` déjà chargé + signal `tracksPerChallenge` du `SettingsService` — aucun appel serveur), rouge < 3 jours, orange < 7, vert sinon
- `AdminActionsService` — `generateToday()`, `reset()`, `refreshPreviews()` (re-check des previews Deezer : affiche « X vérifiés, Y corrigés, Z échecs » puis recharge le pool)

## Intercepteurs

### `playerAuthInterceptor`

Ajoute `withCredentials: true` sur toutes les requêtes vers `/api` **sauf** `/api/admin`. Nécessaire pour envoyer le cookie HTTP-only joueur en cross-origin (Northflank).

### `adminAuthInterceptor`

Ajoute `Authorization: Bearer <token>` sur toutes les requêtes vers `/api/admin`. Token lu depuis `localStorage` (`admin_token`).

## Conventions

- **Standalone partout** — pas de `NgModule`
- **Signals plutôt que `BehaviorSubject`** sauf si Observable vraiment nécessaire
- **`inject(...)` plutôt que constructor injection**
- **Nouveau control flow** : `@if`, `@for`, `@switch` (pas `*ngIf`, `*ngFor`)
- **Tailwind utility-first** dans les templates ; `var(--...)` pour toutes les couleurs (pas de hex inline)
- **`onmouseenter`/`onmouseleave` JS interdit** — utiliser `hover:` Tailwind à la place
- **Pas de logique dans le template** — toute logique dans `computed()` ou méthode
- **Un composant = un dossier** avec `.ts` + `.html` externes (pas de `template:` inline)
- **`TranslatePipe`** importé dans chaque composant qui affiche du texte
- **`ChangeDetectionStrategy.OnPush` obligatoire** sur tous les composants — avec Signals, Angular notifie automatiquement les composants concernés ; `Default`/`Eager` déclenche un CD complet à chaque événement DOM
- **`takeUntilDestroyed(destroyRef)`** sur toutes les subscriptions Observables — dans les composants, injecter `DestroyRef` et passer en argument ; dans le `constructor()`, `takeUntilDestroyed()` sans argument suffit (contexte d'injection actif)

## Contraintes mobile

- **`playsInline`** sur l'élément audio (iOS ouvre sinon le player natif en plein écran)
- **Premier `play()` dans une interaction utilisateur** (gesture) — iOS bloque sinon
- **`100dvh`** au lieu de `100vh` (barres système iOS/Android)
- **Inputs ≥ 16px** — sinon iOS auto-zoome au focus
- **`touch-action: manipulation`** sur les boutons pour supprimer le délai 300ms

## Déploiement — Docker + nginx

`Dockerfile.prod` (multi-stage) : build Angular (`node:22-alpine`, `npm ci` + `npm run build`) puis copie `dist/InSeconds.Client/browser` dans une image `nginxinc/nginx-unprivileged:alpine` servant sur le port 8080. `nginx.conf` (copié dans `/etc/nginx/conf.d/default.conf`) définit les headers `Cache-Control` — **distinction cruciale entre fichiers hashés et non hashés** :

- **Bundles JS/CSS** (`~* \.(?:js|css)$`) — hashés par `angular.json` (`outputHashing: "all"`, un nom de fichier différent à chaque build) → `public, max-age=31536000, immutable`. Aucun risque de servir une version périmée : un nouveau contenu a toujours une nouvelle URL.
- **`i18n/*.json`, `index.html`/routes SPA** (tout le reste, via `try_files $uri $uri/ /index.html`) — noms de fichiers stables → `no-cache` (revalidation systématique auprès du serveur, via `ETag`/`Last-Modified`). Sans ça, un navigateur peut garder en cache une ancienne version après déploiement — incident du 2026-08-15 (piège 20 du [`CLAUDE.md`](../CLAUDE.md)) : un joueur a vu des clés i18n manquantes affichées en brut (`admin.browserId.label` au lieu du texte traduit) alors que le serveur servait déjà la version à jour.

Vérifié par le job CI `nginx-headers` (`scripts/check-nginx-cache-headers.sh`) — construit et sert réellement l'image Docker de prod (le seul job à le faire ; les tests E2E tournent contre `ng serve`, pas contre nginx).

## À venir

- Tests mobiles (iOS Safari, Android Chrome)
- Polish : accessibilité WCAG 2.1 AA, RGPD

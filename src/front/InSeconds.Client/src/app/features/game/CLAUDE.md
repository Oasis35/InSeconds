# CLAUDE.md — feature `game/`

Doc détaillée de la feature de jeu. Vue d'ensemble générale : voir le `CLAUDE.md` racine. Conventions Angular globales (signals, `OnPush`, `TranslatePipe`, `var(--...)`) : idem, pas répétées ici.

## Machine à états (`game.component.ts`)

```ts
type GameState = 'loading' | 'welcome' | 'resume_prompt' | 'playing' | 'done' | 'error' | 'no_challenge' | 'already_played'
```

`GameComponent` porte tout l'état métier (session, tracks, score, résultats). Les screens et `blind-round` sont des composants de présentation purs (inputs/outputs), sans état de session partagé entre eux. `providers: [GameFacadeService]` — instance scopée au composant, pas root.

### Orchestration parent/enfants

```
GameComponent
 ├─ app-game-header          toujours affiché : playing/streak/score/progression/avatar profil → (abandon)
 ├─ app-welcome-screen       [welcome]         → (startGame → beginGame → POST)
 ├─ app-resume-screen        [resume_prompt]   → (resumeGame → beginResume → POST) / (abandon → beginAbandonFromResume → POST)
 ├─ app-confirm-sheet        abandon en jeu OU confirmation de sortie → (confirm)/(cancelled)
 ├─ app-status-screen        [no_challenge | error] (titleKey/bodyKey différents) → (retry)
 ├─ app-already-played-screen [already_played] → (share)
 ├─ app-blind-round #roundRef [playing]        → (answered) / (nextTrack)
 │     (le parent appelle roundRef().setResult(...) en retour — seule communication impérative)
 ├─ app-final-recap-screen   [done]            → (share)
 ├─ app-game-footer          toujours affiché, hors état
 └─ toast de streak (inline) [done | already_played], guest uniquement → (dismiss local)
```

### `peekSession(context)` (appelée dans `ngOnInit` + `retry()`) — lecture seule

Appelle `gameService.peekToday()` (`GET /api/sessions/today`) qui **ne crée ni session ni cookie** (cf. `CLAUDE.md` racine « Création paresseuse de la session »). Stocke `currentStreak`, `peekTracksCount`, `peekCompletedCount`, puis mappe `res.state` :
- `can_start` → état `welcome`
- `resumable` → état `resume_prompt` (le back ne renvoie **pas** encore les tracks : `peekCompletedCount`/`peekTracksCount` suffisent à l'écran de reprise)
- `already_played` → état `already_played` + countdown + `api.apiStatsToday()` pour `todayStats`
- `abandoned` → état `already_played` avec `sessionAbandoned=true`
- `no_challenge` → état `no_challenge`

`context` : `'initial'` (premier chargement / retry) · `'refocus'` (retour au premier plan depuis welcome/resume_prompt) · `'playing'` (retour au premier plan pendant une partie — on ne bascule **que** sur `already_played`/`abandoned`, jamais vers welcome/resume, pour ne pas éjecter le joueur de son round).

### `loadSession()` — POST, déclenché uniquement sur action explicite

Appelée par `beginGame()` (clic « Commencer à jouer »), `beginResume()` (clic « Reprendre ») — les deux passent d'abord l'état à `loading`. Appelle `gameService.startToday()` (`POST /api/sessions` → **c'est ici que le Player + le cookie + la session sont créés**) :
- **Succès `isResuming=true`** → restaure `resumeCompletedAnswers`, `currentIndex`, `totalScore`, **anti-cheat de reprise** (`currentTrackId`/`minListenedSeconds` → `currentTrackMinListenedSeconds`), `preloadAll`, puis **directement `resumePlaying()`** (pas de retour à l'écran de reprise — le joueur a déjà cliqué).
- **Succès `isResuming=false`** → reset complet, `preloadAll`, puis **directement `startPlaying()`** (état `playing`).
- **Erreur `409`** (`abandoned` → `sessionAbandoned=true`) → `already_played` + countdown (+ `apiStatsToday()` si complété).
- **Erreur `503`** → `no_challenge`. **Autre** → `error`.

`beginAbandonFromResume()` (clic « Abandonner » sur l'écran de reprise) : `startToday()` d'abord (pour matérialiser `sessionId`), puis `confirmAbandon()`.

`resumePlaying()` reconstitue `results()` (`RoundResult`, voir `final-recap-screen`) à partir de `resumeCompletedAnswers` ; `currentIndex` = nb de réponses ; état `playing`.

### Synchronisation multi-onglets

Listener `visibilitychange` posé dans `ngOnInit` (retiré dans `ngOnDestroy`) : au retour au premier plan, `peekSession('refocus')` si l'état est `welcome`/`resume_prompt`, `peekSession('playing')` si l'état est `playing` — détecte qu'une partie a été complétée/abandonnée ailleurs (bascule vers `already_played`) sans jamais relancer de `POST`.

### Toast de streak (guest, écrans `done`/`already_played`)

Bloc `position:fixed` inline dans `game.component.html` (pas un composant partagé — usage unique), à côté des blocs `showLeaveConfirm`/confirm-sheet déjà inlinés là. Signal `streakToastDismissed`, condition d'affichage : `!playerSession.isLinked() && !streakToastDismissed() && displayStreak() > 0 && (gameState()==='done' || gameState()==='already_played')`. **Remis à `false` à chaque (ré)entrée dans ces deux états** — 5 points d'écriture à garder synchronisés si la machine à états est retouchée : les deux branches `already_played`/`abandoned` de `peekSession()`, la branche 409 de `loadSession()`, `confirmAbandon()`, et `onNextTrack()` (transition vers `done`). Le bouton ✕ se contente de `streakToastDismissed.set(true)` (inline, pas de méthode dédiée) ; le bouton "Créer" est un simple `routerLink="/login"`. Testé dans `game.component.spec.ts` (les 5 points de reset, pas le rendu du template).

### Garde de sortie (`UnsavedGameComponent`, branché sur `unsavedGameGuard`)

- `@HostListener('window:beforeunload')` : `preventDefault()` si `gameState()==='playing'` (dialog natif navigateur).
- `canDeactivate()` : `true` immédiat hors `playing`. Sinon résout toute confirmation déjà pendante à `false` (évite Promise orpheline en navigation ré-entrante), ouvre `showLeaveConfirm`, retourne une `Promise<boolean>` résolue par `confirmLeave()`/`cancelLeave()`.
- `effect()` constructeur : si l'état quitte `playing` en tâche de fond (ex. dernière réponse HTTP qui résout) alors que la confirmation est ouverte, résout automatiquement à `true`.

### Progression du round

- `onAnswered(event)` : soumet via `gameService.submitAnswer`, met à jour `totalScore`, pousse un `RoundResult`, puis **appelle impérativement `roundRef()?.setResult(response)`** (accès via `viewChild`). En cas d'erreur réseau : `roundRef()?.setResult({score:0,...}, true)` — le 2ᵉ argument déclenche le toast d'erreur dans `blind-round` sans bloquer la progression.
- `onNextTrack()` : incrémente l'index ; si dépassement → état `done`, anime `displayedTotalScore` via `countUp(totalScore(), ..., 1000)` (1s, plus long que le défaut 600ms de `blind-round`), démarre le countdown minuit UTC.

### Partage / countdown

`share()`/`shareFromStats()` construisent un texte (date, lignes ✅/❌ par morceau, score, `environment.appUrl`), délèguent la copie à `copyToClipboard()` → **`ClipboardService.copy()`** (`core/services/clipboard.service.ts`, `providedIn: root`) qui encapsule `navigator.clipboard.writeText` et résout `Promise<boolean>` (jamais de rejet à catcher côté appelant). Succès → `shareCopied=true` 2s. Échec (permission refusée / contexte non sécurisé) → `shareFailed=true` 3s. `ClipboardService` est mutualisé avec la feature `admin/` (`BrowserIdComponent`, `ChallengesTabComponent` — copie de l'ID joueur/navigateur) ; le comportement de `game.component` est inchangé par cette extraction, seule la ligne `navigator.clipboard.writeText` a été déplacée dans le service partagé. `startCountdown()` : `setInterval` 1s jusqu'à minuit UTC, formaté `HH:MM:SS`, nettoyé dans `ngOnDestroy`.

## `blind-round/blind-round.component.ts` — le round de jeu

Inputs : `track` (`required`), `isLast=false`, `sessionId=0`, `minListenedSeconds: number|null=null`. Outputs : `answered` (`AnsweredEvent`), `nextTrack`.

- `durations = computed(...)` : filtre `settings.allowedDurations()` pour ne garder que les valeurs `>= minListenedSeconds()` — **c'est ici** que l'anti-cheat de reprise masque les paliers trop courts.
- `maxDuration = computed(...)` : dernier élément de `durations()` (donc déjà borné par l'anti-cheat de reprise) — plafond utilisé pour positionner les repères de paliers sur la barre de progression (`(d / maxDuration()) * 100` en `%left`).
- `scaleRatio = computed(...)` : `chosenDuration() / maxDuration()` — repondère `audio.progress()` (0→1 relatif au palier choisi) sur l'échelle 0→`maxDuration()` de la barre, utilisée pour la largeur de son remplissage dans le template.
- **Plus de choix de palier initial (2026-08)** : un `effect()` constructeur démarre automatiquement la lecture au premier élément de `durations()` dès que `audio.isIdle()` et que `track().previewUrl` existe — l'utilisateur n'a plus de boutons de paliers à cliquer avant d'écouter. Pendant l'écoute, la barre de progression affiche de petits repères aux positions des paliers restants + un texte `blindRound.stepsUpTo` (« tu peux écouter jusqu'à Xs ») tant que `maxDuration() > chosenDuration()`, pour ne pas décourager l'utilisateur sans lui imposer de choix. Le bouton « écouter plus » (`listenMore()`/`nextDuration()`) reste le seul moyen de prolonger.
- `nextDuration = computed(...)` : palier suivant par rapport à `chosenDuration()` (signal — nécessaire pour que ce computed se recalcule, une propriété simple ne déclenche pas la réactivité), ou `null` si dernier palier.
- **Anti-cheat « min écouté »** : `effect()` constructeur observe `audio.state()`. Passage à `'finished'` sans `result()` encore présent → `gameService.updateListening(sessionId, trackId, chosenDuration)`, persistant la durée effectivement écoutée **avant** la soumission (garde `sid>0 && tid>0 && dur>0`).
- Autocomplete : `query$ = new Subject<string>()`, souscrit à `deezerSearch.search(query$)` dans le constructeur (`takeUntilDestroyed`). `onQueryChange(q)` réinitialise `artistAnswer`/`titleAnswer` (retaper invalide la sélection précédente), pousse dans `query$`.
- **Navigation clavier dans la dropdown** (`onSearchKeydown`, signal `highlightedIndex`, défaut `-1` = aucune sélection) : `↓`/`↑` déplacent la surbrillance (`moveHighlight`, cycle avec wrap-around ; depuis `-1`, `↓` va au premier élément et `↑` va directement au dernier), `Entrée` sélectionne l'élément en surbrillance s'il y en a une (`selectSuggestion`, sans soumettre le formulaire — comme un clic) sinon laisse le comportement par défaut (soumission du round), `Échap` ferme la dropdown sans toucher au champ. `highlightedIndex` est remis à `-1` à chaque nouvelle réponse de recherche, sélection, `clearSearch()` et `next()`. Le survol souris (`mouseenter` sur chaque `<li>`) resynchronise `highlightedIndex` pour garder clavier/souris cohérents. Couvert par `blind-round.component.spec.ts` (12 tests, unitaire) et `e2e/specs/autocomplete-keyboard-nav.spec.ts` (4 tests, E2E).
- `listenMore()` : passe à `nextDuration()` et appelle `audio.extend(next)` — **prolongations libres et chaînables**, pas de limite au nombre d'appels (jusqu'au dernier palier configuré). Le template masque le bouton uniquement quand `nextDuration()` est `null` (dernier palier atteint) — il n'y a plus de garde `!audio.extended()` empêchant une deuxième prolongation.
- `submit()`/`doSubmit()` : si aucune suggestion sélectionnée mais `searchQuery` non vide, split naïf sur `" - "` (artiste / reste = titre) en fallback texte libre. Si vide après trim → confirmation inline (`showEmptyConfirm`) avant soumission plutôt qu'envoi direct.
- `setResult(r, isNetworkError=false)` (appelée par le parent via `viewChild`) : anime `displayedScore` (`countUp`, défaut 600ms). Si `isNetworkError` → toast 4000ms (timer nettoyé/relancé proprement). **Replay preview** : si preview existe et `chosenDuration()>0`, `audio.replayFull()` — rejoue le morceau en entier après révélation, indépendamment du palier choisi.
- **Histogramme de révélation** : le bloc résultat n'affiche plus la ligne texte « Ton temps / Moy. / Pas trouvé » mais `<app-guess-time-chart>` (`shared/guess-time-chart/`) alimenté par `r.guessTimeDistribution` + `r.notFoundCount`, avec `highlightDuration` = palier écouté si le joueur a trouvé, sinon `highlightNotFound`. Instancié **sans `titleKey`** (pas de titre au-dessus du graphe) et volontairement compact (graphe borné à `max-width:210px` centré, barres fines de 14px arrondies (`rounded-full`), hauteur ~36px) pour tenir dans un viewport mobile sans scroll — le bloc de révélation a aussi été resserré (`gap-3`, pochette `w-24`, score `2.25rem`). Aucun état ni helper local ajouté — tout le calcul est dans le composant partagé.
- `next()` : reset complet de l'état local (audio, result, displayedScore, réponses, recherche, suggestions, chosenDuration, isSubmitting, toast + timer), émet `nextTrack`.
- `ngOnDestroy` : `audio.reset()` + nettoyage timer réseau (évite qu'un audio continue ou qu'un timer déclenche un set-state après destruction).
- Sélection de suggestion sur `(mousedown)` et non `(click)` — doit primer sur le `blur` du champ qui masque la liste après 150ms (`onBlur()`).

## `services/game-facade.service.ts`

`@Injectable()` (pas root, scopé au `GameComponent`). Pure délégation vers `core/services/game.service.ts` (`peekToday`, `startToday`, `submitAnswer`, `abandonSession`, `updateListening`) sans logique propre — existe pour permettre le mock/l'injection scopée en test sans toucher au service global.

## `services/deezer-autocomplete.service.ts`

`providedIn: 'root'`, stateless. Seule méthode : `search(query$: Observable<string>): Observable<DeezerSuggestion[]>`. Pipeline : `debounceTime(300)` → `distinctUntilChanged()` → `switchMap`. Sous 2 caractères après trim → `of([])` (pas d'appel réseau). Erreur réseau → `catchError(() => of([]))` (silencieux, pas de propagation).

## `components/game-header/` et `components/game-footer/`

- **`game-header`** : présentationnel + injecte `PlayerSessionService` directement (pattern déjà établi côté admin pour des services `core/` injectés dans un composant présentationnel, cf. `admin/CLAUDE.md`). Inputs `required` : `playing`, `showStreak`, `streak`, `totalScore`, `currentIndex`, `trackCount`. Output `abandon`. Badge streak 🔥 / score en cours de partie : **`left-4`** (déplacé depuis `right-4` en 2026-09 pour laisser la place à l'avatar). **Avatar profil** : bouton rond 32px (initiale du pseudo via `profileInitial()`, `'?'` si pas de pseudo), dégradé `--gradient-primary`, `routerLink="/profile"`, visible si `playerSession.isLinked() && !playing()` — posé à droite (`right-2`). Pas de spec avant 2026-09 ; `game-header.component.spec.ts` couvre `profileInitial()` (majuscule / fallback) + l'output `abandon`.
- **`game-footer`** : pas d'inputs/outputs. Injecte `LanguageService`, `currentLang = language.current` réexposé. `toggleLanguage()` bascule fr↔en. Liens `/admin`, `/privacy`. Injecte aussi `PlayerSessionService` (`isLinked`/`pseudo` réexposés) — icône de connexion discrète (silhouette SVG monochrome, même registre que admin/privacy/contact, **pas** la pilule colorée du bouton langue), placée juste avant celui-ci. Volontairement sans libellé visible : `[title]`/`aria-label` dynamique via `loginTooltip()` (`"Se connecter"` guest, pseudo nu — sans suffixe — pour un compte lié). `onLoginIconClick()` : `router.navigateByUrl(isLinked() ? '/profile' : '/login')` — **simple navigation, plus de pop-up "compte connecté" ni de `logout()` local** depuis 2026-09 (la déconnexion vit désormais uniquement dans `features/profile/`, cf. plus bas). Testé (`game-footer.component.spec.ts`) : bascule fr→en/en→fr + persistance `localStorage`, navigation `/login` vs `/profile` selon `isLinked()`, tooltip guest vs compte lié (pseudo nu).

## `features/profile/` — écran Profil (2026-09)

Hors arbre `game/` (feature standalone sœur, route lazy `/profile` dans `app.routes.ts`) mais documenté ici car c'est la destination de l'avatar header et de l'icône footer ci-dessus, et il reprend la logique de déconnexion qui vivait auparavant dans `game-footer`.

- **`ProfileComponent`** : même charpente que `features/login/request/` (`da-bg` + `<app-decor-background/>` + colonne centrée `screen-enter`). `ngOnInit()` : `!playerSession.isLinked()` → `router.navigateByUrl('/login')` (pas de guard de route dédié, cohérent avec la légèreté des autres routes).
- **Pseudo éditable** : signal `pseudoDraft` (init depuis `playerSession.pseudo()`), computeds `saveDisabled`/`saveLabel`/`hint`/`hintIsError` qui reproduisent exactement la logique de choix de pseudo de `login/verify` (`unchanged`/`tooShort (<3)`/`invalid (>20 ou vide)`/`taken`/`saved`/`saving`). `savePseudo()` appelle `playerSession.updatePseudo(...)` (`PUT /api/players/me/pseudo`, back `Features/Players/UpdatePseudo/`) — `409` → statut `taken`, autre erreur → `error`.
- **Stats** : carte 2 colonnes streak (`playerSession.currentStreak`) / parties jouées (`playerSession.gamesPlayed`), toutes deux peuplées par `GET /api/players/me` (étendu 2026-09, cf. `src/back/InSeconds.Api/CLAUDE.md`).
- **Déconnexion** : bouton → `<app-confirm-sheet tone="danger">` (logique reprise telle quelle de l'ancien `game-footer.confirmLogout()` : `playerSession.logout()` puis `playerSession.load()`), puis retour à `/`.
- Testé : `profile.component.spec.ts` (redirection guest, `saveDisabled`/statuts de sauvegarde, flow de déconnexion) + `e2e/specs/profile.spec.ts` (avatar → profil, changement de pseudo succès/pris, redirection guest).

## `screens/*`

Tous `OnPush`, présentationnels (sauf `already-played-screen` qui type `stats` sur `TodayStatsResponse`).

- **`welcome-screen`** : `trackCount` (required) → `startGame`. Injecte aussi `PlayerSessionService` directement (2026-09) : sous le bouton "Jouer", guest → bouton outline "Se connecter / Créer un compte" (`routerLink="/login"`) + texte d'accroche ; compte lié → lien discret "Connecté comme {{pseudo}}" (`routerLink="/profile"`).
- **`resume-screen`** : `completedCount`, `trackCount` (required), `abandonLoading=false` → `resumeGame`/`abandon`. Signal local `showAbandonConfirm` : double confirmation avant d'émettre réellement `abandon`. Injecte `PlayerSessionService` (2026-09) : guest uniquement → bouton outline "Ne plus perdre mes parties" (`routerLink="/login"`) entre "Reprendre" et "Abandonner".
- **`status-screen`** : générique, réutilisé pour `no_challenge` ET `error` — `titleKey`/`bodyKey` (clés i18n passées par le parent) → `retry`.
- **`already-played-screen`** : `stats: TodayStatsResponse|null`, `abandoned=false`, `countdown` (required), `shareCopied`/`shareFailed=false` → `share`. Signal `showTrackDetails` (accordéon). Si `abandoned()` : message simple + countdown. Sinon : carte score/médiane (fallback `—` si `medianScore<=0`), `app-share-button`, puis l'accordéon délègue à **`<app-track-results-list [rows]="playedRows()">`** — `playedRows` (computed) mappe `stats().tracks` (`TrackStat`) → `TrackResultRow[]`. Lignes **identiques au récap** (chips `✓/✗`, durée, `+score` cliquable → pop-up histogramme). Injecte `PlayerSessionService` (2026-09) : si complété (pas abandonné) et guest, `<app-login-nudge-banner>` sous la carte (`bodyKey="loginNudge.anyDeviceBody"`, `bodyParams={streak: s.currentStreak}`).
- **`final-recap-screen`** : **exporte `RoundResult`** — le contrat que `GameComponent` construit dans `onAnswered`/`resumePlaying` :
  ```ts
  interface RoundResult {
    artistCorrect; titleCorrect; score; correctArtist; correctTitle;
    listenedDurationSeconds; averageSecondsWhenCorrect: number | undefined;
    failureRatePercent; position; coverUrl: string | null; deezerTrackId;
  }
  ```
  Inputs (required) : `results`, `displayedScore`. `shareCopied`/`shareFailed=false`, `canShare=true`, `countdown=''` → `share`.
  `RoundResult` porte toujours `averageSecondsWhenCorrect`/`failureRatePercent`. Input `stats: TodayStatsResponse | null` (fourni par `GameComponent`, qui appelle `apiStatsToday()` à l'entrée de l'état `done`). L'accordéon délègue à **`<app-track-results-list [rows]="recapRows()">`** — `recapRows` (computed) mappe `results()` (`RoundResult`) + fusionne l'histogramme (`guessTimeDistribution`/`notFoundCount`) depuis `stats` par `position`. Résilience : la liste vient de `results()` (toujours présent) ; si `stats` est `null` la liste s'affiche quand même, seule la pop-up est indisponible. La pop-up (`openChart` signal, fermeture backdrop / ✕ / `Échap`) et le rendu des lignes vivent **dans `TrackResultsListComponent`** (`shared/track-results-list/`), plus dans cet écran. Injecte `PlayerSessionService` (2026-09) : guest → `<app-login-nudge-banner titleKey="loginNudge.keepScoreTitle" bodyKey="loginNudge.keepScoreBody">` sous la carte.

## Composants partagés utilisés

- **`shared/confirm-sheet/`** : `tone: 'danger'|'warning'`, `title`/`body`/`confirmLabel`/`cancelLabel` (required), `loading=false`, `confirmStyle`/`cancelStyle` personnalisables (utilisé pour inverser les couleurs entre confirmation d'abandon et confirmation de sortie). Outputs `confirm`/`cancelled`.
- **`shared/share-button/`** : `copied` (required), `failed=false`, `disabled=false` → `share`.
- **`shared/guess-time-chart/`** : histogramme « en combien de temps les autres ont trouvé » (écran de révélation + pop-up de `track-results-list`). Inputs `distribution` (`DurationBucketDto[]`, required), `notFoundCount=0`, `highlightDuration: number|null=null`, `highlightNotFound=false`, `titleKey=''`. Présentationnel pur (computed `buckets`), pas d'output.
- **`shared/track-results-list/`** : liste accordéon des morceaux d'un défi + pop-up histogramme au clic sur un `+score`. Input unique `rows: TrackResultRow[]` (interface exportée). Possède `openChart` signal + `@HostListener('document:keydown.escape')`. Mutualisé entre `final-recap-screen` (`recapRows`) et `already-played-screen` (`playedRows`).
- **`shared/login-nudge-banner/`** (2026-09) : bannière de nudge connexion (carte `rounded-2xl`, pas la forme asymétrique réservée aux cartes principales). Inputs `titleKey`/`bodyKey` (required, clés i18n — le titre **et** le corps varient selon l'écran, contrairement à un CTA fixe), `bodyParams={}` (interpolation optionnelle, ex. `{streak}`). Le CTA (`routerLink="/login"`) et son libellé (`loginNudge.cta`) sont fixes. Pas d'output. Mutualisé entre `already-played-screen` et `final-recap-screen` uniquement — `welcome-screen`/`resume-screen` utilisent un bouton outline inline (pattern différent, pas de carte).

## Services `core/` consommés (hors périmètre `game/` mais central ici)

- **`core/services/game.service.ts`** (`providedIn: 'root'`) : appels HTTP purs sur `/api/sessions` — `peekToday()` (`GET /today`, lecture seule, ne crée rien), `startToday()` (`POST`, crée session+cookie), `submitAnswer()` (`POST /answers`), `abandonSession()` (`PUT /abandon`), `updateListening()` (`PATCH /listening`).
- **`core/services/clipboard.service.ts`** (`providedIn: 'root'`) : `copy(text): Promise<boolean>`, wrapper `navigator.clipboard.writeText` qui ne rejette jamais côté appelant. Mutualisé avec `admin/` (`BrowserIdComponent`, `ChallengesTabComponent`).
- **`core/services/settings.service.ts`** : signals avec défauts codés en dur (utilisés tant que `/api/settings` n'a pas répondu) — `allowedDurations=[0.5,1,1.5,2,3,5,10]`, `guessTimerSeconds=20`, `tracksPerChallenge=10`, `durationScores={0.5:1000,1:850,1.5:700,2:550,3:400,5:250,10:100}`. `load()` fait un `catchError` + `console.warn` : **l'app démarre même si `/api/settings` échoue**.
- **`core/services/audio-player.service.ts`** : `AudioState = 'idle'|'loading'|'playing'|'finished'`. Mécanisme central `playToken` (compteur incrémenté à chaque `play()`/`reset()`) qui invalide tout callback async périmé (`oncanplay`, `onerror`, `setTimeout`, boucle rAF) — protège contre les races si l'utilisateur relance vite une nouvelle lecture pendant qu'une ancienne charge encore.
  - `play(url, duration)` → `loading` → `oncanplay` → `playing`, programme l'arrêt auto + la boucle de progression rAF.
  - `replayFull()` : rejoue depuis `currentTime=0` jusqu'à la fin naturelle (`onended` → `finished`), sans limite artificielle.
  - `extend(nextDuration)` : **prolongations libres, chaînables sans limite** (jusqu'au dernier palier). Comportement dual selon `state()` : si `'playing'`, continue depuis `audio.currentTime` réel jusqu'au nouveau palier (pas de replay, juste un reschedule de l'arrêt auto) ; sinon (`'finished'`/`'idle'`), relit depuis le début (`currentTime=0`) jusqu'au nouveau palier. Pose `wasExtended=true`/`extended.set(true)` dans les deux cas — appelé depuis `BlindRoundComponent.listenMore()` à chaque clic sur « écouter plus ».
  - `stop()` : retourne `{listenedSeconds, wasExtended}`, `navigator.vibrate?.(50)` (haptique mobile).
  - `preloadAll(urls)` : injecte des `<link rel="preload" as="audio">` (hint navigateur, pas de vrai fetch), no-op SSR-safe, retourne `Promise.resolve()` immédiat.
- **`core/services/player-session.service.ts`** (`providedIn: 'root'`) : `isGuest`/`isLinked`/`email`/`pseudo`/`currentStreak`/`gamesPlayed` signals, peuplés par `load()` (`GET /api/players/me?peek=true`, jamais d'écriture). `updatePseudo(pseudo)` (2026-09) appelle `PUT /api/players/me/pseudo` et met à jour le signal `pseudo` local en cas de succès. Consommé directement par `game-header`, `game-footer`, `welcome-screen`, `resume-screen`, `already-played-screen`, `final-recap-screen` (nudges connexion) et `features/profile/`.
- **`core/guards/unsaved-game.guard.ts`** : `unsavedGameGuard: CanDeactivateFn<UnsavedGameComponent> = c => c.canDeactivate()` — délègue entièrement à `GameComponent`.
- **`core/models/game.models.ts`** : ré-export pur depuis `api/api.generated.ts` (`TrackSlot`, `StartSessionResponse`, `ResumedAnswer`, `SubmitAnswerBody as SubmitAnswerRequest`, `SubmitAnswerResponse`).
- **`core/count-up.ts`** : `countUp(target, setter, duration=600)` — anime via rAF, easing quadratique. Court-circuite (`setter(target)` direct) si `target===0`, `prefers-reduced-motion`, ou `window.__disableAnimations===true` (flag posé par les tests E2E Playwright — sinon l'animation rAF ne tourne pas sous horloge figée `page.clock`).

## Constantes à connaître

| Valeur | Emplacement | Rôle |
|---|---|---|
| `300ms` / `2` car. | `deezer-autocomplete.service.ts` | debounce autocomplete / seuil avant appel réseau |
| `150ms` | `blind-round` `onBlur()` | délai avant fermeture suggestions (laisse le `mousedown` s'exécuter) |
| `4000ms` | `blind-round` | durée toast erreur réseau |
| `2000ms` / `3000ms` | `game.component` `copyToClipboard` | durée `shareCopied` / `shareFailed` |
| `600ms` défaut / `1000ms` | `count-up.ts` / `game.component.onNextTrack` | durée animation score |
| `600px` | `game.component` `viewportTall` | seuil viewport "grand écran" |
| `50ms` | `audio-player.service` | vibration à l'arrêt auto |
| `409` / `503` | `game.component.loadSession` (POST) | 409 = session déjà existante (`already_played`/`abandoned`) / 503 = pas de défi. Au chargement de page c'est `peekSession` (GET) qui décide via `res.state`, sans code d'erreur. |

## Points d'attention pour un futur agent

1. **`roundRef()?.setResult(...)`** est la seule communication impérative parent→enfant de toute la feature (le reste passe par inputs/outputs standards) — à préserver si on refactore `game.component`/`blind-round`.
2. Toute nouvelle valeur par défaut de `Settings` (back) doit être répliquée dans `settings.service.ts` (fallback front) — cf. règle générale du CLAUDE.md racine sur l'ajout de settings.
3. **Prolongation libre depuis le 2026-07-17** — `AudioPlayerService.extend()` n'a plus de limite au nombre d'appels ni de malus de score associé (`ScoreCalculator` ne lit plus `WasExtended`). Ne pas réintroduire de garde « une seule prolongation » sans repasser par une décision produit explicite.
4. **Code mort — `BlindRoundComponent.mainAction()`** : n'est référencé nulle part (ni le template, ni les tests) depuis le passage à l'auto-play (2026-08) — le bouton replay du template appelle `audio.play(...)` directement. À muscler (brancher sur un bouton) ou supprimer plutôt que laisser traîner si un futur agent le retrouve.
5. **Toast de streak — 5 points de reset à garder synchronisés** (cf. section dédiée plus haut) : toute nouvelle transition vers `done`/`already_played` ajoutée à `game.component.ts` doit remettre `streakToastDismissed` à `false`, sinon le toast resterait masqué indéfiniment après un premier dismiss.
6. **Nudges de connexion = uniquement des rappels, jamais un blocage** — tous gardés par `PlayerSessionService.isLinked()` (`welcome-screen`/`resume-screen`/`already-played-screen`/`final-recap-screen`/toast de streak). Le jeu guest doit rester 100% fonctionnel sans jamais afficher ces éléments pour un compte lié — cf. décision d'architecture racine "pas de fermeture d'accès".

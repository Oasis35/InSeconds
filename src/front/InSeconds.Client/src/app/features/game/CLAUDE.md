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
 ├─ app-game-header          toujours affiché : playing/streak/score/progression → (abandon)
 ├─ app-welcome-screen       [welcome]         → (startGame)
 ├─ app-resume-screen        [resume_prompt]   → (resumeGame) / (abandon)
 ├─ app-confirm-sheet        abandon en jeu OU confirmation de sortie → (confirm)/(cancelled)
 ├─ app-status-screen        [no_challenge | error] (titleKey/bodyKey différents) → (retry)
 ├─ app-already-played-screen [already_played] → (share)
 ├─ app-blind-round #roundRef [playing]        → (answered) / (nextTrack)
 │     (le parent appelle roundRef().setResult(...) en retour — seule communication impérative)
 ├─ app-final-recap-screen   [done]            → (share)
 └─ app-game-footer          toujours affiché, hors état
```

### `loadSession()` (appelée dans `ngOnInit` + `retry()`)

Appelle `gameService.startToday()` :
- **Succès** : stocke `sessionId`, `tracks`, `currentStreak`.
  - `isResuming=true` → restaure `resumeCompletedAnswers`, `currentIndex=resumeFromPosition`, `totalScore` recalculé. **Anti-cheat de reprise** : si `response.currentTrackId` correspond à la track en cours et que le back fournit `minListenedSeconds`, verrouille `currentTrackMinListenedSeconds` — empêche de re-choisir un palier plus court que ce qui a déjà été « consommé » côté serveur avant le rechargement (voir `blind-round` § anti-cheat). Précharge l'audio (`audioPlayer.preloadAll`) puis état `resume_prompt`.
  - sinon : reset complet puis état `welcome`.
- **Erreur `409`** : déjà joué aujourd'hui. `err.error?.error === 'abandoned'` → `sessionAbandoned=true`. État `already_played` + countdown minuit UTC. Si complété (pas abandonné), appelle en plus `api.apiStatsToday()` pour peupler `todayStats`.
- **Erreur `503`** : pas de défi du jour → état `no_challenge`.
- **Autre erreur** : état `error`.

`resumePlaying()` reconstitue `results()` (tableau `RoundResult`, voir `final-recap-screen`) à partir de `resumeCompletedAnswers` pour permettre un récap final complet même après reprise ; `currentIndex` = nb de réponses complétées ; passe l'état à `playing`.

### Synchronisation multi-onglets

Listener `visibilitychange` posé dans `ngOnInit` (retiré dans `ngOnDestroy`) : si le document redevient visible pendant `welcome`/`resume_prompt`/`playing`, relance `loadSession()` — détecte qu'une partie a été jouée/abandonnée ailleurs (le back répondra 409 le cas échéant).

### Garde de sortie (`UnsavedGameComponent`, branché sur `unsavedGameGuard`)

- `@HostListener('window:beforeunload')` : `preventDefault()` si `gameState()==='playing'` (dialog natif navigateur).
- `canDeactivate()` : `true` immédiat hors `playing`. Sinon résout toute confirmation déjà pendante à `false` (évite Promise orpheline en navigation ré-entrante), ouvre `showLeaveConfirm`, retourne une `Promise<boolean>` résolue par `confirmLeave()`/`cancelLeave()`.
- `effect()` constructeur : si l'état quitte `playing` en tâche de fond (ex. dernière réponse HTTP qui résout) alors que la confirmation est ouverte, résout automatiquement à `true`.

### Progression du round

- `onAnswered(event)` : soumet via `gameService.submitAnswer`, met à jour `totalScore`, pousse un `RoundResult`, puis **appelle impérativement `roundRef()?.setResult(response)`** (accès via `viewChild`). En cas d'erreur réseau : `roundRef()?.setResult({score:0,...}, true)` — le 2ᵉ argument déclenche le toast d'erreur dans `blind-round` sans bloquer la progression.
- `onNextTrack()` : incrémente l'index ; si dépassement → état `done`, anime `displayedTotalScore` via `countUp(totalScore(), ..., 1000)` (1s, plus long que le défaut 600ms de `blind-round`), démarre le countdown minuit UTC.

### Partage / countdown

`share()`/`shareFromStats()` construisent un texte (date, lignes ✅/❌ par morceau, score, `environment.appUrl`), `navigator.clipboard.writeText`. Succès → `shareCopied=true` 2s. Échec (permission refusée / contexte non sécurisé) → catch explicite → `shareFailed=true` 3s (sans ce catch : unhandled rejection). `startCountdown()` : `setInterval` 1s jusqu'à minuit UTC, formaté `HH:MM:SS`, nettoyé dans `ngOnDestroy`.

## `blind-round/blind-round.component.ts` — le round de jeu

Inputs : `track` (`required`), `isLast=false`, `sessionId=0`, `minListenedSeconds: number|null=null`. Outputs : `answered` (`AnsweredEvent`), `nextTrack`.

- `durations = computed(...)` : filtre `settings.allowedDurations()` pour ne garder que les valeurs `>= minListenedSeconds()` — **c'est ici** que l'anti-cheat de reprise masque les paliers trop courts.
- `nextDuration = computed(...)` : palier suivant par rapport à `chosenDuration()` (signal — nécessaire pour que ce computed se recalcule, une propriété simple ne déclenche pas la réactivité), ou `null` si dernier palier.
- **Anti-cheat « min écouté »** : `effect()` constructeur observe `audio.state()`. Passage à `'finished'` sans `result()` encore présent → `gameService.updateListening(sessionId, trackId, chosenDuration)`, persistant la durée effectivement écoutée **avant** la soumission (garde `sid>0 && tid>0 && dur>0`).
- Autocomplete : `query$ = new Subject<string>()`, souscrit à `deezerSearch.search(query$)` dans le constructeur (`takeUntilDestroyed`). `onQueryChange(q)` réinitialise `artistAnswer`/`titleAnswer` (retaper invalide la sélection précédente), pousse dans `query$`.
- `listenMore()` : passe à `nextDuration()` et **relit depuis le début** avec `audio.play(track().previewUrl, next)` — ne passe **pas** par `audio.extend()` malgré son existence (voir incohérence notée sous `AudioPlayerService`).
- `submit()`/`doSubmit()` : si aucune suggestion sélectionnée mais `searchQuery` non vide, split naïf sur `" - "` (artiste / reste = titre) en fallback texte libre. Si vide après trim → confirmation inline (`showEmptyConfirm`) avant soumission plutôt qu'envoi direct.
- `setResult(r, isNetworkError=false)` (appelée par le parent via `viewChild`) : anime `displayedScore` (`countUp`, défaut 600ms). Si `isNetworkError` → toast 4000ms (timer nettoyé/relancé proprement). **Replay preview** : si preview existe et `chosenDuration()>0`, `audio.replayFull()` — rejoue le morceau en entier après révélation, indépendamment du palier choisi.
- `next()` : reset complet de l'état local (audio, result, displayedScore, réponses, recherche, suggestions, chosenDuration, isSubmitting, toast + timer), émet `nextTrack`.
- `ngOnDestroy` : `audio.reset()` + nettoyage timer réseau (évite qu'un audio continue ou qu'un timer déclenche un set-state après destruction).
- Sélection de suggestion sur `(mousedown)` et non `(click)` — doit primer sur le `blur` du champ qui masque la liste après 150ms (`onBlur()`).

## `services/game-facade.service.ts`

`@Injectable()` (pas root, scopé au `GameComponent`). Pure délégation vers `core/services/game.service.ts` (`startToday`, `submitAnswer`, `abandonSession`, `updateListening`) sans logique propre — existe pour permettre le mock/l'injection scopée en test sans toucher au service global.

## `services/deezer-autocomplete.service.ts`

`providedIn: 'root'`, stateless. Seule méthode : `search(query$: Observable<string>): Observable<DeezerSuggestion[]>`. Pipeline : `debounceTime(300)` → `distinctUntilChanged()` → `switchMap`. Sous 2 caractères après trim → `of([])` (pas d'appel réseau). Erreur réseau → `catchError(() => of([]))` (silencieux, pas de propagation).

## `components/game-header/` et `components/game-footer/`

- **`game-header`** : purement présentationnel. Inputs `required` : `playing`, `showStreak`, `streak`, `totalScore`, `currentIndex`, `trackCount`. Output `abandon`. Badge streak 🔥 si `showStreak()`, recouvert visuellement par le score si `playing()`.
- **`game-footer`** : pas d'inputs/outputs. Injecte `LanguageService`, `currentLang = language.current` réexposé. `toggleLanguage()` bascule fr↔en. Liens `/admin`, GitHub, `/privacy`. Testé (`game-footer.component.spec.ts`) : bascule fr→en/en→fr + persistance `localStorage`.

## `screens/*`

Tous `OnPush`, présentationnels (sauf `already-played-screen` qui type `stats` sur `TodayStatsResponse`).

- **`welcome-screen`** : `trackCount` (required) → `startGame`.
- **`resume-screen`** : `completedCount`, `trackCount` (required), `abandonLoading=false` → `resumeGame`/`abandon`. Signal local `showAbandonConfirm` : double confirmation avant d'émettre réellement `abandon`.
- **`status-screen`** : générique, réutilisé pour `no_challenge` ET `error` — `titleKey`/`bodyKey` (clés i18n passées par le parent) → `retry`.
- **`already-played-screen`** : `stats: TodayStatsResponse|null`, `abandoned=false`, `countdown` (required), `shareCopied`/`shareFailed=false` → `share`. Signal `showTrackDetails` (accordéon). Si `abandoned()` : message simple + countdown. Sinon : carte score/médiane (fallback `—` si `medianScore<=0`), `app-share-button`, accordéon morceaux avec lien `deezer.com/track/{deezerTrackId}`.
- **`final-recap-screen`** : **exporte `RoundResult`** — le contrat que `GameComponent` construit dans `onAnswered`/`resumePlaying` :
  ```ts
  interface RoundResult {
    artistCorrect; titleCorrect; score; correctArtist; correctTitle;
    listenedDurationSeconds; averageSecondsWhenCorrect: number | undefined;
    failureRatePercent; position; coverUrl: string | null; deezerTrackId;
  }
  ```
  Inputs (required) : `results`, `displayedScore`. `shareCopied`/`shareFailed=false`, `canShare=true`, `countdown=''` → `share`.

## Composants partagés utilisés

- **`shared/confirm-sheet/`** : `tone: 'danger'|'warning'`, `title`/`body`/`confirmLabel`/`cancelLabel` (required), `loading=false`, `confirmStyle`/`cancelStyle` personnalisables (utilisé pour inverser les couleurs entre confirmation d'abandon et confirmation de sortie). Outputs `confirm`/`cancelled`.
- **`shared/share-button/`** : `copied` (required), `failed=false`, `disabled=false` → `share`.

## Services `core/` consommés (hors périmètre `game/` mais central ici)

- **`core/services/game.service.ts`** (`providedIn: 'root'`) : appels HTTP purs sur `/api/sessions` — `startToday()` (`POST`), `submitAnswer()` (`POST /answers`), `abandonSession()` (`PUT /abandon`), `updateListening()` (`PATCH /listening`).
- **`core/services/settings.service.ts`** : signals avec défauts codés en dur (utilisés tant que `/api/settings` n'a pas répondu) — `allowedDurations=[0.5,1,1.5,2,3,5,10]`, `guessTimerSeconds=20`, `maxExtensions=1`, `tracksPerChallenge=10`, `durationScores={0.5:1000,1:850,1.5:700,2:550,3:400,5:250,10:100}`. `load()` fait un `catchError` + `console.warn` : **l'app démarre même si `/api/settings` échoue**.
- **`core/services/audio-player.service.ts`** : `AudioState = 'idle'|'loading'|'playing'|'finished'`. Mécanisme central `playToken` (compteur incrémenté à chaque `play()`/`reset()`) qui invalide tout callback async périmé (`oncanplay`, `onerror`, `setTimeout`, boucle rAF) — protège contre les races si l'utilisateur relance vite une nouvelle lecture pendant qu'une ancienne charge encore.
  - `play(url, duration)` → `loading` → `oncanplay` → `playing`, programme l'arrêt auto + la boucle de progression rAF.
  - `replayFull()` : rejoue depuis `currentTime=0` jusqu'à la fin naturelle (`onended` → `finished`), sans limite artificielle.
  - `extend(nextDuration)` : une seule prolongation autorisée (garde `wasExtended || state()!=='playing'`). **Non appelée nulle part dans le parcours utilisateur actuel** — `listenMore()` dans `blind-round` relit depuis le début plutôt que d'étendre. Conséquence : `extended` ne devient jamais `true`, `wasExtended` envoyé au back est toujours `false`. Dette technique/incohérence à garder en tête si on retouche ce flux.
  - `stop()` : retourne `{listenedSeconds, wasExtended}`, `navigator.vibrate?.(50)` (haptique mobile).
  - `preloadAll(urls)` : injecte des `<link rel="preload" as="audio">` (hint navigateur, pas de vrai fetch), no-op SSR-safe, retourne `Promise.resolve()` immédiat.
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
| `409` / `503` | `game.component.loadSession` | 409 = session déjà existante (`already_played`) / 503 = pas de défi (`no_challenge`) |

## Points d'attention pour un futur agent

1. **`AudioPlayerService.extend()` est mort code fonctionnellement** — présent et testable, mais jamais appelé par l'UI (`listenMore()` relit depuis le début à la place). Ne pas supposer que `wasExtended`/`MaxExtensionsPerAnswer` (setting) sont réellement exploités côté client tant que ce flux n'a pas été rebranché.
2. **`roundRef()?.setResult(...)`** est la seule communication impérative parent→enfant de toute la feature (le reste passe par inputs/outputs standards) — à préserver si on refactore `game.component`/`blind-round`.
3. Toute nouvelle valeur par défaut de `Settings` (back) doit être répliquée dans `settings.service.ts` (fallback front) — cf. règle générale du CLAUDE.md racine sur l'ajout de settings.

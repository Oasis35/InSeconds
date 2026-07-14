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
│   │   │       ├── game.service.ts             # POST /sessions + /answers
│   │   │       ├── language.service.ts         # détection/changement FR/EN, persist localStorage
│   │   │       └── settings.service.ts         # GET /settings → signals
│   │   ├── shared/
│   │   │   ├── confirm-sheet/
│   │   │   │   └── confirm-sheet.component.ts  # bottom-sheet de confirmation réutilisable
│   │   │   └── share-button/
│   │   │       └── share-button.component.ts   # bouton partage réutilisable (already-played + done)
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   │   ├── admin.component.ts          # shell (~45 lignes) — injecte les 6 services
│   │   │   │   ├── admin.models.ts             # interfaces partagées (TrackDto, ChallengeDto, …)
│   │   │   │   ├── services/
│   │   │   │   │   ├── admin-http.service.ts   # HTTP brut + signal authenticated + login/logout/checkAuth
│   │   │   │   │   ├── admin-state.service.ts  # signals partagés (selectedDay, poolReloadTrigger, …)
│   │   │   │   │   ├── admin-api.service.ts    # rxResource (pool, stats, challenges) + computed accessors
│   │   │   │   │   ├── admin-stats.service.ts  # état dashboard (navigation, formatage dates, …)
│   │   │   │   │   ├── admin-pool.service.ts   # filtres/pagination/sélection pool, modales ajout/suppression
│   │   │   │   │   └── admin-actions.service.ts # generateToday(), reset(), refreshPreviews()
│   │   │   │   └── components/
│   │   │   │       ├── admin-login/
│   │   │   │       ├── dashboard-tab/
│   │   │   │       ├── pool-tab/
│   │   │   │       ├── challenges-tab/
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
│   │   │   │   │   └── game-footer/            # pied de page (liens admin/github/confidentialité + langue FR/EN)
│   │   │   │   └── screens/
│   │   │   │       ├── welcome-screen/
│   │   │   │       ├── resume-screen/
│   │   │   │       ├── status-screen/          # handles no_challenge + error (titleKey/bodyKey)
│   │   │   │       ├── already-played-screen/
│   │   │   │       └── final-recap-screen/     # exporte aussi RoundResult
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
readonly maxExtensions = signal(1);
readonly tracksPerChallenge = signal(3);
readonly durationScores = signal<Record<number, number>>({});
```

`load()` fait un `catchError` : si `/api/settings` est indisponible au boot, l'app démarre quand même avec les valeurs par défaut des signals (mêmes défauts que le back), `console.warn` seulement.

### `AudioPlayerService`

Modèle "durée choisie" : l'utilisateur choisit le palier AVANT d'écouter, l'audio joue exactement cette durée puis s'arrête automatiquement. Une seule prolongation autorisée (palier supérieur).

Signals exposés : `state` (`idle | loading | playing | finished`), `listenedSeconds`, `extended`, `progress` (0→1, mis à jour via `requestAnimationFrame` pour la barre de progression live).

Méthodes publiques :
- `play(trackUrl, durationSeconds)` — charge et joue l'audio pour la durée choisie
- `extend(nextDurationSeconds)` — prolonge d'un palier (une seule fois)
- `stop()` — arrête et retourne `{ listenedSeconds, wasExtended }`
- `reset()` — nettoie tout (appelé dans `ngOnDestroy` de `BlindRoundComponent`)
- `replayFull()` — rejoue depuis le début jusqu'à la fin naturelle (30s), sans timer
- `preloadAll(trackUrls)` — injecte des `<link rel="preload" as="audio">` dans le `<head>`, non bloquant

### `DeezerAutocompleteService`

Autocomplete Deezer (`features/game/services/`, `providedIn: root`, stateless) : prend un `Observable<string>`, applique debounce 300ms + distinctUntilChanged, appelle `GET /api/deezer/search?q=xxx` (proxy back pour éviter les CORS), retourne `DeezerSuggestion[]` (`artist`, `title`).

### `GameService`

```typescript
startToday(): Observable<StartSessionResponse>
submitAnswer(sessionId: number, body: SubmitAnswerRequest): Observable<SubmitAnswerResponse>
abandonSession(sessionId: number): Observable<void>
updateListening(sessionId: number, trackId: number, duration: number): Observable<void>
```

### `LanguageService`

```typescript
readonly current = signal<Lang>('fr');
init(): void          // appelé au boot via provideAppInitializer
use(lang: Lang): void // change la langue, persiste en localStorage
```

## Composants

### `GameComponent`

Orchestre une session complète. États : `loading` → `welcome` → `playing` → `done` (+ `resume_prompt`, `already_played`, `no_challenge`, `error`).

Délègue l'affichage à des sous-composants :
- **`GameHeaderComponent`** : titre InSeconds + streak + score en cours + barre de progression + bouton abandon
- **`GameFooterComponent`** : liens admin / GitHub / confidentialité + bouton langue FR/EN
- **`WelcomeScreenComponent`** : état `welcome`
- **`ResumeScreenComponent`** : état `resume_prompt` (avec confirmation abandon inline)
- **`StatusScreenComponent`** : états `no_challenge` + `error` (inputs `titleKey`/`bodyKey` i18n)
- **`AlreadyPlayedScreenComponent`** : état `already_played` (score vs médiane, accordéon morceaux, `ShareButtonComponent`)
- **`FinalRecapScreenComponent`** : état `done` (liste morceaux, score animé, `ShareButtonComponent`)
- **`BlindRoundComponent`** : état `playing`
- **`ConfirmSheetComponent`** : modales abandon + quitter

**Confirmation de sortie** : implémente `UnsavedGameComponent` (`canDeactivate()`). Si `gameState() === 'playing'`, ouvre une modale et renvoie une `Promise<boolean>`. `@HostListener('window:beforeunload')` couvre la fermeture d'onglet.

### `BlindRoundComponent`

Layout B — deux zones toujours présentes :
- **Zone player** : paliers au départ, puis bouton Replay + "Écouter jusqu'à Xs" + barre de progression live + chrono
- **Zone saisie** : champ unique `"Artiste - Titre"` avec dropdown autocomplete Deezer (debounce 300ms), bouton Valider

Polish UX : `isSubmitting` (loading sur Valider), bouton `✕` lié à `(mousedown)`, tooltip paliers (`scoreForDuration`), score count-up (`countUp` rAF), toast erreur réseau (4s).

`setResult(r, isNetworkError?)` — méthode publique appelée depuis `GameComponent` via `viewChild`.

### `ConfirmSheetComponent`

Bottom-sheet de confirmation réutilisable (`shared/confirm-sheet/`). Inputs : `title`, `body`, `tone` (`danger`/`warning`), `confirmLabel`, `cancelLabel`, `loading`, `confirmStyle`, `cancelStyle`. Outputs : `confirm`, `cancel`.

### `ShareButtonComponent`

Bouton partage réutilisable (`shared/share-button/`). Inputs : `copied: boolean`, `failed?: boolean`, `disabled?: boolean`. Output : `share`. Utilisé dans `AlreadyPlayedScreenComponent` et `FinalRecapScreenComponent`. Si `failed` est vrai (rejet de `clipboard.writeText` : permission refusée, contexte non sécurisé), le hint est remplacé par un message d'erreur (`share.failed`, signal `shareFailed` posé 3 s par `GameComponent.copyToClipboard()`).

### `PrivacyComponent`

Page confidentialité (`features/privacy/`), route lazy `/privacy` + alias `/confidentialite` (redirect). Contenu entièrement via clés i18n `privacy.*`. Style éditorial : vouvoiement formel, l'utilisateur n'est jamais nommé (« l'éditeur du site »). Accessible depuis le lien bouclier du footer.

### `AdminComponent`

Shell ~45 lignes. Fournit les 6 services via `providers: [AdminHttpService, AdminStateService, AdminApiService, AdminStatsService, AdminPoolService, AdminActionsService]` au niveau du composant (pas `root`). Ordre des onglets : **Dashboard, Défis, Pool, Actions**. Délègue à 7 sous-composants :

- **`AdminLoginComponent`** : formulaire login, `loginStatus` signal local
- **`DashboardTabComponent`** : injecte `AdminStatsService` — sélecteur de jour + KPIs, activité 30 jours, répartition joueurs
- **`PoolTabComponent`** : injecte `AdminPoolService`, contient `AddTrackModalComponent` + `DeleteTrackModalComponent` ; affiche l'**autonomie du pool** (« X jours de défis restants ») en ligne à côté du compteur disponible/utilisé
- **`ChallengesTabComponent`** : injecte `AdminStatsService` — **stats par défi** (accordéon médiane/min/max, taux artiste/titre par morceau) + historique des défis, avec un navigateur ‹ Mois Année › unique en haut de l'onglet
- **`ActionsTabComponent`** : injecte `AdminActionsService`
- **`AddTrackModalComponent`** : injecte `AdminPoolService`
- **`DeleteTrackModalComponent`** : injecte `AdminPoolService`

Services admin (`features/admin/services/`) :
- `AdminHttpService` — HTTP brut + signal `authenticated` + `login`/`logout`/`checkAuth`
- `AdminStateService` — signals partagés (`selectedDay`, `poolSearchQuery`, `poolReloadTrigger`, `challengesReloadTrigger`)
- `AdminApiService` — rxResource (pool/stats/challenges/search) + computed accessors ; délègue HTTP à `AdminHttpService`, état à `AdminStateService`
- `AdminStatsService` — état dashboard + onglet Défis (navigation jour/mois, formatage dates, accordéon stats par défi)
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

## À venir

- Tests mobiles (iOS Safari, Android Chrome)
- Polish : accessibilité WCAG 2.1 AA, RGPD

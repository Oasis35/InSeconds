# Architecture Frontend (Angular 20)

> Référence d'architecture frontend InSeconds. Reflète l'état du code à `src/front/InSeconds.Client/`. Pour les conventions et pièges connus, voir [`CLAUDE.md`](../CLAUDE.md).

## Stack

- **Angular 20** (CLI 20.1.x, standalone components + signals)
- **TypeScript 5.8**
- **Tailwind CSS v4** via `@tailwindcss/postcss` dans `.postcssrc.json`
- **SCSS** : `@use "tailwindcss";` en haut de `src/styles.scss` (PAS `@import`)
- **NSwag 14.7.1** : génération du client TypeScript depuis l'OpenAPI back (`npm run generate-api`)
- **Port front pinné à 5173** (évite le conflit avec d'autres projets sur 4200)

## Structure dossiers

```
src/front/InSeconds.Client/
├── nswag.json                              # config génération client TS depuis OpenAPI
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── api.generated.ts           # ⚠️ GÉNÉRÉ — ne pas éditer manuellement
│   │   ├── core/
│   │   │   ├── interceptors/
│   │   │   │   ├── player-auth.interceptor.ts  # withCredentials: true sur /api (hors /admin)
│   │   │   │   └── admin-auth.interceptor.ts   # Bearer token sur /api/admin
│   │   │   ├── models/
│   │   │   │   └── game.models.ts         # re-exports depuis api.generated.ts
│   │   │   └── services/
│   │   │       ├── audio-player.service.ts    # signal-based, durée choisie
│   │   │       ├── game.service.ts             # POST /sessions + /answers
│   │   │       └── settings.service.ts         # GET /settings → signals
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   │   └── admin.component.ts     # login + gestion pool + défis
│   │   │   └── game/
│   │   │       ├── game.component.ts      # orchestration session complète
│   │   │       └── blind-round/
│   │   │           └── blind-round.component.ts  # choix palier + lecture + saisie
│   │   ├── app.config.ts                  # providers globaux
│   │   ├── app.routes.ts                  # routes
│   │   └── app.ts                         # composant racine
│   ├── environments/
│   │   ├── environment.ts                 # prod (apiUrl + appUrl Northflank)
│   │   └── environment.development.ts     # dev (apiUrl http://localhost:5171, appUrl http://localhost:5173)
│   └── styles.scss
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
]
```

- `playerAuthInterceptor` passe avant `adminAuthInterceptor` — ordre important
- `ApiClient` injectable partout, `API_BASE_URL` pointe sur `environment.apiUrl`
- `SettingsService.load()` est appelé avant le premier rendu (via `provideAppInitializer`)

## NSwag — client TypeScript généré

`nswag.json` pointe sur `http://localhost:5171/openapi/v1.json` et génère `src/app/api/api.generated.ts` avec la classe `ApiClient` + tous les types DTO.

```bash
# Regénérer après un changement d'endpoint ou de DTO back :
docker compose up -d           # s'assurer que le back tourne avec le nouveau code
npm run generate-api           # runtime Net100
npm run build                  # vérifier que le build TypeScript passe
```

`api.generated.ts` **est commité** — le backend ne tourne pas en CI donc la génération ne peut pas s'y faire automatiquement. Après toute regénération locale, commiter le fichier mis à jour. Les composants et services importent les types via `game.models.ts` qui re-exporte depuis le fichier généré.

## Services

### `SettingsService`

Charge les settings de la BD au boot, expose des signals :

```typescript
readonly allowedDurations = signal<number[]>([0.5, 1, 1.5, 2, 3, 5, 10]);
readonly guessTimerSeconds = signal(20);
readonly maxExtensions = signal(1);
readonly tracksPerChallenge = signal(10);
readonly durationScores = signal<Record<number, number>>({
  0.5: 1000, 1: 850, 1.5: 700, 2: 550, 3: 400, 5: 250, 10: 100,
});
```

### `AudioPlayerService`

Modèle "durée choisie" : l'utilisateur choisit le palier AVANT d'écouter, l'audio joue exactement cette durée puis s'arrête automatiquement. Une seule prolongation autorisée (palier supérieur).

Signals exposés : `state` (`idle | loading | playing | finished`), `listenedSeconds`, `extended`, `progress` (0→1, mis à jour via `requestAnimationFrame` pour la barre de progression live).

Méthodes publiques :
- `play(trackUrl, durationSeconds)` — charge et joue l'audio pour la durée choisie
- `extend(nextDurationSeconds)` — prolonge d'un palier (une seule fois)
- `stop()` — arrête et retourne `{ listenedSeconds, wasExtended }`
- `reset()` — nettoie tout (appelé dans `ngOnDestroy` de `BlindRoundComponent`)
- `preloadAll(trackUrls)` — injecte des `<link rel="preload" as="audio">` dans le `<head>` pour chaque URL, non bloquant. Retourne `Promise<void>` immédiatement. Appelé par `GameComponent` après `startToday()`.

### `DeezerSearchService`

Autocomplete Deezer : prend un `Observable<string>`, applique debounce 300ms + distinctUntilChanged, appelle `GET /api/deezer/search?q=xxx` (proxy back pour éviter les CORS), retourne `DeezerSuggestion[]` (`artist`, `title`).

### `GameService`

```typescript
startToday(): Observable<StartSessionResponse>
submitAnswer(sessionId: number, body: SubmitAnswerRequest): Observable<SubmitAnswerResponse>
```

Types importés depuis `game.models.ts` (qui re-exporte `api.generated.ts`).

## Composants

### `GameComponent`

Orchestre une session complète. États : `loading` → `welcome` → `playing` → `done` (+ `already_played`, `no_challenge`, `error`).

- État `loading` : appel `POST /api/sessions` puis `audioPlayer.preloadAll()` (non bloquant) — passe directement en `welcome`
- État `welcome` : page d'accueil avec bouton "Commencer à jouer"
- Récap final : badge officiel "À écouter sur Deezer" (`DeezerBadgeComponent`) + streak + bouton partage emoji Wordle-style
- Partage : `🟩🟩 0.5s | 🟨⬜ 2s | 🟥🟥 10s` + score + lien `appUrl/blindtest` (copié dans le presse-papier)

### `BlindRoundComponent`

Layout B — deux zones toujours présentes (pas de clignotement) :
- **Zone player** (haut) : paliers au départ, puis bouton unique Start/Stop/Replay + barre de progression live + chrono `Xs / Xs`
- **Zone saisie** (bas) : champ unique `"Artiste - Titre"` avec dropdown autocomplete Deezer (debounce 300ms), bouton Valider grisé pendant l'écoute

`chosenDuration` est un **signal** (pas une propriété ordinaire) pour que `nextDuration` (computed) se recalcule réactivement.

Affiche après chaque réponse :
- Ton temps d'écoute
- Moyenne du temps des joueurs ayant trouvé (`averageSecondsWhenCorrect`)
- % de joueurs n'ayant pas trouvé (`failureRatePercent`)

### `DeezerBadgeComponent`

SVG inline du badge officiel "À écouter sur Deezer" (blanc sur transparent). Inputs `width` et `height`. Utilisé dans le récap final et l'écran "déjà joué".

### `AdminComponent`

Route `/admin`. Login Bearer token → trois onglets :
- **Dashboard** : activité 30 jours (barres), répartition joueurs, stats par défi (accordéon expandable)
- **Pool** : sous-onglets "Disponibles" (avec indicateur preview vert/rouge) / "Déjà utilisés" ; bouton "+ Ajouter" ouvre une popup avec recherche Deezer, lecteur preview 30s, boutons "Ajouter" / "Ajouter et fermer"
- **Défis** : historique des défis avec les morceaux de chaque défi

## Intercepteurs

### `playerAuthInterceptor`

Ajoute `withCredentials: true` sur toutes les requêtes vers `/api` **sauf** `/api/admin`. Nécessaire pour envoyer le cookie HTTP-only joueur en cross-origin (Northflank).

### `adminAuthInterceptor`

Ajoute `Authorization: Bearer <token>` sur toutes les requêtes vers `/api/admin`. Token lu depuis `localStorage` (`admin_token`). Contourne les restrictions cross-domain du cookie `SameSite=None`.

## Conventions

- **Standalone partout** — pas de `NgModule`
- **Signals plutôt que `BehaviorSubject`** sauf si Observable vraiment nécessaire
- **`inject(...)` plutôt que constructor injection**
- **Nouveau control flow** : `@if`, `@for`, `@switch` (pas `*ngIf`, `*ngFor`)
- **Tailwind utility-first** dans les templates ; SCSS local seulement pour ce que Tailwind ne couvre pas
- **Pas de logique dans le template** — toute logique dans `computed()` ou méthode

## Contraintes mobile

- **`playsInline`** sur l'élément audio (iOS ouvre sinon le player natif en plein écran)
- **Premier `play()` dans une interaction utilisateur** (gesture) — iOS bloque sinon
- **`100dvh`** au lieu de `100vh` (barres système iOS/Android)
- **Inputs ≥ 16px** — sinon iOS auto-zoome au focus
- **`touch-action: manipulation`** sur les boutons pour supprimer le délai 300ms

## À venir

- Tests Karma/Jasmine (`AudioPlayerService`, `GameService`)
- Tests E2E Playwright (flux complet 1 partie)
- Polish : charte graphique, accessibilité, RGPD

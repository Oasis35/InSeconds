# Architecture Frontend (Angular 20)

> Référence d'architecture frontend InSeconds. Reflète l'état du code à `src/front/InSeconds.Client/` + ce qui est prévu pour les features. Pour les conventions et pièges connus, voir [`CLAUDE.md`](../CLAUDE.md).

## Stack

- **Angular 20** (CLI 20.1.x, standalone components + signals **par défaut**)
- **TypeScript 5.8**
- **Tailwind CSS v4** intégré via le plugin PostCSS `@tailwindcss/postcss`
- **SCSS** comme préprocesseur — `@use "tailwindcss";` en haut de `src/styles.scss`
- **HttpClient** via `provideHttpClient(withFetch())` dans `app.config.ts`
- **Pas de Docker côté front** — `ng serve` tourne en local pour la rapidité du hot-reload
- **Port front pinné à 5173** (évite le conflit avec Screlec et TimeTracker qui occupent tous les deux le 4200)
- **API consommée sur `http://localhost:5171`** en dev (variable d'env)

## Création initiale (déjà fait)

Pour mémoire, voici les commandes qui ont scaffoldé le projet :

```bash
cd src/front
ng new InSeconds.Client --routing --style=scss --skip-git --ssr=false --defaults
cd InSeconds.Client
npm install tailwindcss @tailwindcss/postcss postcss --save-dev
```

Et le pin du port dans `angular.json` sous `projects.InSeconds.Client.architect.serve.options` :

```json
{
  "port": 5173,
  "host": "localhost"
}
```

## Structure dossiers actuelle (et cible)

```
src/front/InSeconds.Client/
├── src/
│   ├── app/
│   │   ├── core/                          # (à venir) services + models partagés
│   │   │   ├── services/
│   │   │   │   ├── audio-player.service.ts    # signal-based, durée choisie
│   │   │   │   ├── game.service.ts             # POST /sessions, /answers
│   │   │   │   ├── leaderboard.service.ts      # GET /leaderboard
│   │   │   │   └── settings.service.ts         # GET /settings (paliers, timer, …)
│   │   │   └── models/                         # types métier (Player, Track, Session, …)
│   │   ├── features/                       # (à venir) une feature = un dossier
│   │   │   ├── game/                       # composant conteneur + sous-composants
│   │   │   ├── leaderboard/
│   │   │   └── auth/
│   │   ├── app.ts                          # ✅ composant racine, ping /health
│   │   ├── app.html                        # ✅ page d'accueil tailwindée
│   │   ├── app.scss                        # ✅
│   │   ├── app.config.ts                   # ✅ providers (router, HttpClient)
│   │   ├── app.routes.ts                   # ✅ routes
│   │   └── app.spec.ts
│   ├── environments/                       # ✅
│   │   ├── environment.ts                  # prod-like (apiUrl = '/api')
│   │   └── environment.development.ts      # dev (apiUrl = 'http://localhost:5171')
│   ├── styles.scss                         # ✅ @use "tailwindcss"
│   ├── index.html
│   └── main.ts
├── public/
├── .postcssrc.json                         # ✅ { "plugins": { "@tailwindcss/postcss": {} } }
├── angular.json                            # ✅ port 5173 pinné, fileReplacements dev/prod
├── package.json
├── tsconfig.json
└── tsconfig.app.json
```

✅ = déjà en place. Le reste arrivera avec les features.

## Configuration actuelle

### `app.config.ts`

```typescript
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()),
  ],
};
```

### `environments/environment.development.ts`

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5171',
};
```

### `environments/environment.ts` (prod-like)

```typescript
export const environment = {
  production: true,
  apiUrl: '/api',         // suppose un reverse proxy en prod (à ajuster)
};
```

Le `fileReplacements` dans `angular.json` swap automatiquement `environment.ts` → `environment.development.ts` en mode dev.

### `styles.scss`

```scss
@use "tailwindcss";

/* Styles globaux InSeconds — ajoute ici ce qui doit s'appliquer partout. */
```

### `app.ts` (état actuel — page d'accueil avec ping `/health`)

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet } from '@angular/router';
import { catchError, of } from 'rxjs';

import { environment } from '../environments/environment';

type HealthState = 'loading' | 'ok' | 'ko';
interface HealthResponse { status: string; utc: string; }

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly health = signal<HealthState>('loading');
  protected readonly healthUtc = signal<string | null>(null);

  protected readonly healthLabel = computed(() => {
    switch (this.health()) {
      case 'loading': return 'Connexion au backend…';
      case 'ok': return `Backend OK · ${this.healthUtc()}`;
      case 'ko': return 'Backend KO (vérifie le conteneur API)';
    }
  });

  constructor() {
    this.http.get<HealthResponse>(`${environment.apiUrl}/health`)
      .pipe(catchError(() => of(null)))
      .subscribe(response => {
        if (response) { this.health.set('ok'); this.healthUtc.set(response.utc); }
        else { this.health.set('ko'); }
      });
  }
}
```

## AudioPlayerService — modèle "durée choisie" (à coder)

> ⚠️ **Important** : le modèle a changé par rapport à la v0 du doc. **Plus de mesure d'`elapsedMs` via `requestAnimationFrame`**. L'utilisateur choisit AVANT d'écouter combien de secondes il veut écouter (paliers dans `Settings.AllowedDurationsSeconds`), l'audio joue exactement cette durée puis s'arrête. Plus de stress, plus de timing sub-seconde, code beaucoup plus simple.

```typescript
import { Injectable, signal, computed } from '@angular/core';

export type AudioState = 'idle' | 'loading' | 'playing' | 'finished';

@Injectable({ providedIn: 'root' })
export class AudioPlayerService {
  private audio: HTMLAudioElement | null = null;
  private stopTimer: number | null = null;
  private currentDuration = 0;
  private wasExtended = false;

  readonly state = signal<AudioState>('idle');
  readonly listenedSeconds = signal(0);            // dernière durée jouée
  readonly extended = signal(false);                // l'utilisateur a-t-il prolongé ?

  constructor() {
    if (typeof document !== 'undefined') {
      this.audio = new Audio();
      this.audio.playsInline = true;                // critique iOS
    }
  }

  play(trackUrl: string, durationSeconds: number): void {
    if (!this.audio) return;

    this.currentDuration = durationSeconds;
    this.wasExtended = false;
    this.state.set('loading');

    this.audio.src = trackUrl;
    this.audio.oncanplay = () => {
      this.state.set('playing');
      this.audio!.play().catch(err => console.error('Play failed:', err));
      this.scheduleStop(durationSeconds);
    };
  }

  /** Une seule prolongation autorisée — passe au palier supérieur. */
  extend(nextDurationSeconds: number): void {
    if (this.wasExtended || this.state() !== 'playing') return;

    this.wasExtended = true;
    this.extended.set(true);
    const delta = nextDurationSeconds - this.currentDuration;
    this.currentDuration = nextDurationSeconds;

    if (this.stopTimer !== null) clearTimeout(this.stopTimer);
    this.scheduleStop(delta);
  }

  stop(): { listenedSeconds: number; wasExtended: boolean } {
    if (this.stopTimer !== null) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    if (this.audio) this.audio.pause();

    this.state.set('finished');
    this.listenedSeconds.set(this.currentDuration);
    navigator.vibrate?.(50);                        // feedback haptique mobile

    return { listenedSeconds: this.currentDuration, wasExtended: this.wasExtended };
  }

  reset(): void {
    this.state.set('idle');
    this.listenedSeconds.set(0);
    this.extended.set(false);
    this.currentDuration = 0;
    this.wasExtended = false;
  }

  preloadNext(trackUrl: string): void {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'audio';
    link.href = trackUrl;
    document.head.appendChild(link);
  }

  private scheduleStop(seconds: number): void {
    this.stopTimer = window.setTimeout(() => this.stop(), seconds * 1000);
  }
}
```

Note : pas de `computed potentialScore` qui décroît en temps réel — le score potentiel par palier est **statique** (affichable comme un label "À 3s tu marques jusqu'à 800 pts") et calculé par `SettingsService` ou côté composant.

## GameService (à coder)

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface StartSessionResponse {
  sessionId: number;
  tracks: { id: number; position: number; previewUrl: string }[];   // pas d'artist/title — leak interdit
}

export interface SubmitAnswerCommand {
  trackId: number;
  listenedDurationSeconds: number;
  wasExtended: boolean;
  artistAnswer: string | null;
  titleAnswer: string | null;
}

export interface SubmitAnswerResponse {
  artistCorrect: boolean;
  titleCorrect: boolean;
  score: number;
  correctArtist: string;       // révélé après réponse
  correctTitle: string;
}

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/sessions`;

  startToday(): Observable<StartSessionResponse> {
    return this.http.post<StartSessionResponse>(this.baseUrl, {});
  }

  submitAnswer(sessionId: number, command: SubmitAnswerCommand): Observable<SubmitAnswerResponse> {
    return this.http.post<SubmitAnswerResponse>(`${this.baseUrl}/${sessionId}/answers`, command);
  }
}
```

> **À terme**, ces interfaces seront **générées automatiquement** depuis l'OpenAPI backend via NSwag (`npm run generate-api`). On les écrira à la main pour la 1ʳᵉ feature puis on bascule sur NSwag.

## GameComponent (squelette à coder)

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { BlindRoundComponent } from './blind-round/blind-round.component';
import { GameService } from '../../core/services/game.service';
import { AudioPlayerService } from '../../core/services/audio-player.service';

@Component({
  selector: 'app-game',
  imports: [BlindRoundComponent],
  template: `
    <main class="min-h-dvh bg-slate-950 text-slate-100 p-6">
      <header class="flex justify-between items-center mb-8">
        <h1 class="text-2xl font-bold">InSeconds 🎵</h1>
        <div class="text-sm text-slate-400">{{ currentIndex() + 1 }} / 10</div>
      </header>

      @if (currentTrack(); as track) {
        <app-blind-round
          [track]="track"
          (answered)="onAnswered($event)"
        />
      } @else {
        <p class="text-center">Chargement…</p>
      }

      <p class="mt-8 text-center text-slate-400">Score : {{ totalScore() }}</p>
    </main>
  `,
})
export class GameComponent {
  private readonly gameService = inject(GameService);
  private readonly audioPlayer = inject(AudioPlayerService);

  protected readonly sessionId = signal<number | null>(null);
  protected readonly tracks = signal<{ id: number; position: number; previewUrl: string }[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly totalScore = signal(0);

  protected readonly currentTrack = computed(() => this.tracks()[this.currentIndex()] ?? null);

  constructor() {
    this.gameService.startToday().subscribe(res => {
      this.sessionId.set(res.sessionId);
      this.tracks.set(res.tracks);
    });
  }

  onAnswered(result: { listenedSeconds: number; wasExtended: boolean; artist: string | null; title: string | null }) {
    const sessionId = this.sessionId();
    const track = this.currentTrack();
    if (!sessionId || !track) return;

    this.gameService.submitAnswer(sessionId, {
      trackId: track.id,
      listenedDurationSeconds: result.listenedSeconds,
      wasExtended: result.wasExtended,
      artistAnswer: result.artist,
      titleAnswer: result.title,
    }).subscribe(res => {
      this.totalScore.update(s => s + res.score);
      this.audioPlayer.reset();
      this.currentIndex.update(i => i + 1);
    });
  }
}
```

## BlindRoundComponent (squelette à coder)

L'UI d'une piste : choix du palier, bouton play, prolongation, timer de saisie, formulaire artiste/titre.

```typescript
@Component({
  selector: 'app-blind-round',
  imports: [FormsModule],
  template: `
    <!-- Choix du palier -->
    @if (audio.state() === 'idle') {
      <div class="flex gap-2 flex-wrap justify-center">
        @for (d of allowedDurations(); track d) {
          <button (click)="startPlay(d)" class="px-4 py-2 bg-indigo-600 rounded">
            {{ d }}s
          </button>
        }
      </div>
    }

    <!-- En écoute -->
    @if (audio.state() === 'playing') {
      <div class="text-center">
        <p>Écoute en cours…</p>
        @if (!audio.extended() && nextDuration()) {
          <button (click)="extend()" class="mt-4 underline">
            Prolonger jusqu'à {{ nextDuration() }}s
          </button>
        }
      </div>
    }

    <!-- Saisie -->
    @if (audio.state() === 'finished') {
      <form (ngSubmit)="submit()" class="space-y-3">
        <input [(ngModel)]="artist" name="artist" placeholder="Artiste"
               class="w-full px-3 py-2 text-base" />
        <input [(ngModel)]="title" name="title" placeholder="Titre"
               class="w-full px-3 py-2 text-base" />
        <p class="text-sm text-slate-400">⏱ {{ timerSeconds() }}s restantes</p>
        <button type="submit" class="px-4 py-2 bg-emerald-600 rounded">
          Valider
        </button>
      </form>
    }
  `,
})
export class BlindRoundComponent {
  // … input track, output answered, signaux pour timer, etc.
  // Implémentation à finaliser avec SettingsService pour les paliers
}
```

## Conventions

- **Standalone partout** — pas de `NgModule`, le `imports: [...]` du composant suffit
- **Signals plutôt que `BehaviorSubject`** sauf si vraie nécessité d'un Observable
- **`inject(...)` plutôt que constructor injection** dans les composants — plus concis avec les signals
- **Nouveau control flow** : `@if`, `@for`, `@switch` (pas `*ngIf`, `*ngFor`)
- **Tailwind utility-first** dans les templates ; SCSS dans `.component.scss` seulement pour les cas où Tailwind est insuffisant (animations complexes, styles globaux locaux)
- **Pas d'IIFE / pas de logique dans le template** — toute logique dans une `computed()` ou méthode

## Contraintes mobile

- **`playsInline`** sur l'élément audio (sans ça, iOS ouvre le player natif en plein écran)
- **Premier `play()` dans une interaction utilisateur** (gesture) — sinon iOS bloque
- **`100dvh`** au lieu de `100vh` pour gérer les barres système qui apparaissent/disparaissent
- **Inputs ≥ 16px de taille de police** — sinon iOS auto-zoome sur le focus
- **`touch-action: manipulation`** sur les boutons interactifs pour éviter le délai 300ms de tap

## Auth

### Auth joueur (cookie HTTP-only)

V1 = pseudo seul, géré côté backend par cookie HttpOnly signé (Data Protection ASP.NET).

- Le navigateur envoie automatiquement le cookie sur chaque requête → `withCredentials: true` requis dans les appels `HttpClient`
- Pour l'instant géré manuellement dans `GameService` — un `HttpInterceptor` global reste à créer
- Une slice `Auth/Register` permettra à l'utilisateur de promouvoir son compte guest en inscrit (juste un pseudo)

### Auth admin (Bearer token)

L'admin utilise un `Authorization: Bearer admin-token` header plutôt qu'un cookie, pour contourner les restrictions cross-domain de Chrome (cookie `SameSite=None` bloqué en cross-site).

- À la connexion, l'API retourne `{ token }` → stocké en `localStorage` sous la clé `admin_token`
- `adminAuthInterceptor` (enregistré dans `app.config.ts`) injecte automatiquement le header sur toutes les requêtes `/api/admin`
- À la déconnexion, le token est supprimé du `localStorage`

## Tests

Pas encore en place. À venir :

- **Karma + Jasmine** (déjà scaffoldés par `ng new`) pour les tests unitaires des services et composants
- **Cypress ou Playwright** pour les tests E2E (le doc original mentionne aussi mobile iOS/Android — à voir si on automatise ou si on teste manuellement)

## CI

Le workflow GitHub Actions (`.github/workflows/ci.yml`) tourne sur chaque push :

- **Job `front`** : `npm ci` + `npm run build` (build production, fail si erreur TypeScript ou bundle dépassant les budgets `angular.json`)

→ Penser à vérifier le build prod localement (`npm run build`) avant de pusher, surtout si on ajoute des dépendances ou si on touche aux budgets.

## Prochaines étapes recommandées

1. Coder `SettingsService` qui charge les `Settings` BD au démarrage (paliers, timer, etc.)
2. Coder `AudioPlayerService` (modèle durée-choisie ci-dessus)
3. Coder `GameService` + appels mock pour tester le flow
4. `BlindRoundComponent` complet avec timer de saisie
5. `GameComponent` conteneur qui orchestre les 10 pistes
6. `LeaderboardComponent` (après l'endpoint backend)
7. Setup **NSwag** : `npm install -D nswag` + `nswag.json` + script `npm run generate-api` qui lit `http://localhost:5171/openapi/v1.json` et génère un client TS typé dans `src/app/api/`
8. Auth slice (composant de promotion guest → inscrit)
9. Tests des services et composants

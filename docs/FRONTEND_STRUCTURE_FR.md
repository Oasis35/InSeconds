# Architecture Frontend (Angular 19+)

## Créer le projet

```bash
npm install -g @angular/cli
ng new InSeconds.Client --skip-git --routing --style css
cd InSeconds.Client

# Components standalone (défaut en Angular 19+)
ng config _defaultSchematics.@schematics/angular:component.standalone true

# Optional: Tailwind
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

## Structure dossiers

```
InSeconds.Client/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── services/
│   │   │   │   ├── audio-player.service.ts      # Singleton principal
│   │   │   │   ├── game.service.ts              # Appels API
│   │   │   │   ├── leaderboard.service.ts
│   │   │   │   └── auth.service.ts              # OAuth / pseudo
│   │   │   └── models/
│   │   │       ├── game.model.ts
│   │   │       ├── track.model.ts
│   │   │       └── leaderboard.model.ts
│   │   ├── features/
│   │   │   ├── game/
│   │   │   │   ├── game.component.ts            # Conteneur jeu
│   │   │   │   ├── blind-round/
│   │   │   │   │   ├── blind-round.component.ts # 1 piste
│   │   │   │   │   └── blind-round.component.css
│   │   │   │   ├── audio-player/
│   │   │   │   │   ├── audio-player.component.ts
│   │   │   │   │   └── audio-player.component.css
│   │   │   │   └── game.component.css
│   │   │   ├── leaderboard/
│   │   │   │   ├── leaderboard.component.ts
│   │   │   │   └── leaderboard.component.css
│   │   │   └── auth/
│   │   │       ├── login.component.ts
│   │   │       └── login.component.css
│   │   ├── app.component.ts
│   │   └── app.routes.ts
│   ├── assets/
│   ├── styles.css
│   ├── index.html
│   └── main.ts
├── angular.json
├── tsconfig.json
└── package.json
```

## Code essentiels

### services/audio-player.service.ts

```typescript
import { Injectable, signal, computed, effect } from '@angular/core';

export interface AudioState {
  state: 'idle' | 'loading' | 'playing' | 'stopped';
  elapsedMs: number;
  potentialScore: number;
}

@Injectable({
  providedIn: 'root'
})
export class AudioPlayerService {
  private audio: HTMLAudioElement | null = null;
  private animationFrameId: number | null = null;
  private startTime = 0;
  private pausedTime = 0;

  // Signaux
  state = signal<'idle' | 'loading' | 'playing' | 'stopped'>('idle');
  elapsedMs = signal<number>(0);
  
  potentialScore = computed(() => {
    const elapsed = this.elapsedMs();
    return Math.max(0, Math.round(1000 * (1 - elapsed / 30000)));
  });

  constructor() {
    if (typeof document !== 'undefined') {
      this.audio = new Audio();
      this.audio.playsinline = true;
      this.audio.addEventListener('ended', () => this.stop());
    }
  }

  play(trackUrl: string): void {
    if (!this.audio) return;

    this.state.set('loading');
    this.audio.src = trackUrl;
    this.audio.oncanplay = () => {
      this.state.set('playing');
      this.audio!.play().catch(err => console.error('Play failed:', err));
      this.startTime = Date.now() - this.pausedTime;
      this.updateElapsed();
    };
  }

  stop(): { elapsedMs: number } {
    this.state.set('stopped');
    if (this.audio) this.audio.pause();
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    
    const elapsed = this.elapsedMs();
    navigator.vibrate?.(50); // Feedback haptique
    return { elapsedMs: elapsed };
  }

  private updateElapsed(): void {
    if (this.state() !== 'playing') return;

    const elapsed = Math.min(Date.now() - this.startTime, 30000);
    this.elapsedMs.set(elapsed);

    if (elapsed < 30000) {
      this.animationFrameId = requestAnimationFrame(() => this.updateElapsed());
    } else {
      this.stop();
    }
  }

  preloadNext(trackUrl: string): void {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'audio';
    link.href = trackUrl;
    document.head.appendChild(link);
  }
}
```

### services/game.service.ts

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private apiUrl = 'http://localhost:5000/api'; // Dev

  constructor(private http: HttpClient) {}

  startSession(dailyChallengeId: number, playerId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/sessions`, {
      dailyChallengeId,
      playerId
    });
  }

  submitAnswer(
    sessionId: number,
    trackIndex: number,
    artistAnswer: string,
    titleAnswer: string,
    elapsedMs: number
  ): Observable<any> {
    return this.http.post(`${this.apiUrl}/sessions/${sessionId}/answers`, {
      trackIndex,
      artistAnswer,
      titleAnswer,
      elapsedMs
    });
  }

  getLeaderboard(dailyChallengeId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/leaderboard/${dailyChallengeId}`);
  }
}
```

### features/game/game.component.ts

```typescript
import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BlindRoundComponent } from './blind-round/blind-round.component';
import { GameService } from '../../core/services/game.service';
import { AudioPlayerService } from '../../core/services/audio-player.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, BlindRoundComponent],
  template: `
    <div class="game-container">
      <h1>InSeconds</h1>
      <div class="progress">{{ currentTrack() }} / 10</div>
      
      @for (track of tracks; let i = $index; track by $index) {
        @if (i === currentTrackIndex()) {
          <app-blind-round 
            [track]="track"
            (answered)="onAnswered($event)">
          </app-blind-round>
        }
      }
      
      <div class="score-preview">
        Score potentiel: {{ audioPlayerService.potentialScore() }}
      </div>
    </div>
  `
})
export class GameComponent implements OnInit, OnDestroy {
  tracks: any[] = [];
  currentTrackIndex = signal(0);
  currentTrack = computed(() => this.currentTrackIndex() + 1);

  constructor(
    private gameService: GameService,
    public audioPlayerService: AudioPlayerService
  ) {}

  ngOnInit(): void {
    this.loadDailyChallenge();
  }

  ngOnDestroy(): void {
    this.audioPlayerService.stop();
  }

  private loadDailyChallenge(): void {
    // Récupérer défi du jour depuis API
    // Définir this.tracks = challenge.tracks
  }

  onAnswered(result: any): void {
    // Envoyer réponse au backend
    // Aller piste suivante ou afficher résultats
    this.currentTrackIndex.update(i => i + 1);
  }
}
```

### features/game/blind-round/blind-round.component.ts

```typescript
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioPlayerService } from '../../../core/services/audio-player.service';

@Component({
  selector: 'app-blind-round',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="blind-round">
      <button (click)="toggleAudio()" [disabled]="isPlaying">
        {{ isPlaying ? 'En écoute...' : 'Play ▶️' }}
      </button>

      <div class="score-meter">
        Potentiel: {{ audioPlayerService.potentialScore() }}
      </div>

      <input 
        [(ngModel)]="artistGuess" 
        placeholder="Artiste" 
        [disabled]="isPlaying">
      <input 
        [(ngModel)]="titleGuess" 
        placeholder="Titre" 
        [disabled]="isPlaying">

      <button (click)="submit()" [disabled]="isPlaying">
        Soumettre
      </button>
    </div>
  `,
  styles: [`
    .blind-round {
      padding: 2rem;
      text-align: center;
    }
    input {
      min-width: 16px;
      padding: 0.5rem;
      margin: 0.5rem;
    }
    button {
      padding: 0.75rem 1.5rem;
      margin: 0.5rem;
      font-size: 1rem;
    }
  `]
})
export class BlindRoundComponent implements OnInit {
  @Input() track: any;
  @Output() answered = new EventEmitter();

  artistGuess = '';
  titleGuess = '';
  isPlaying = false;

  constructor(public audioPlayerService: AudioPlayerService) {}

  ngOnInit(): void {
    // Precharger piste suivante si dispo
  }

  toggleAudio(): void {
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.audioPlayerService.play(this.track.previewUrl);
    } else {
      const { elapsedMs } = this.audioPlayerService.stop();
      this.isPlaying = false;
    }
  }

  submit(): void {
    const { elapsedMs } = this.audioPlayerService.stop();
    this.isPlaying = false;

    this.answered.emit({
      artistGuess: this.artistGuess,
      titleGuess: this.titleGuess,
      elapsedMs
    });

    this.resetForm();
  }

  private resetForm(): void {
    this.artistGuess = '';
    this.titleGuess = '';
  }
}
```

---

## Configuration Clés

### environment.ts
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api'
};
```

### tsconfig.json
Vérifier `"lib": ["ES2020", "dom"]` pour support signaux Angular 19+.

---

## Prochaines Étapes

1. `ng new` + structure dossiers
2. Implémenter AudioPlayerService (core)
3. GameService (appels API)
4. GameComponent (conteneur)
5. BlindRoundComponent (UI 1 piste)
6. AuthComponent + routes
7. LeaderboardComponent

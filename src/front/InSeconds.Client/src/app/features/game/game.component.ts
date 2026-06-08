import { Component, inject, signal, computed, viewChild, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../core/services/game.service';
import { TrackSlot, SubmitAnswerResponse } from '../../core/models/game.models';
import { BlindRoundComponent, AnsweredEvent } from './blind-round/blind-round.component';

type GameState = 'loading' | 'playing' | 'done' | 'error' | 'already_played';

@Component({
  selector: 'app-game',
  imports: [BlindRoundComponent, RouterLink],
  template: `
    <div class="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-950 to-black text-slate-100 flex flex-col">
    <main class="flex-1 flex flex-col p-4 w-full max-w-lg mx-auto">

      <!-- En-tête -->
      <header class="py-4 mb-6">
        <div class="flex items-center justify-center relative">
          <h1 class="text-2xl font-bold tracking-tight">InSeconds 🎵</h1>
          @if (gameState() === 'playing') {
            <span class="absolute right-0 text-lg font-semibold">{{ totalScore() }} pts</span>
          }
        </div>
        @if (gameState() === 'playing') {
          <div class="mt-3 flex flex-col gap-1">
            <div class="flex justify-between text-xs text-slate-500">
              <span>Piste {{ currentIndex() + 1 }} / {{ tracks().length }}</span>
            </div>
            <div class="w-full bg-slate-800 rounded-full h-1.5">
              <div class="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                [style.width.%]="(currentIndex() + 1) / tracks().length * 100">
              </div>
            </div>
          </div>
        }
      </header>

      <!-- Chargement -->
      @if (gameState() === 'loading') {
        <div class="flex-1 flex items-center justify-center">
          <p class="text-slate-400 animate-pulse">Chargement du défi du jour…</p>
        </div>
      }

      <!-- Erreur -->
      @if (gameState() === 'error') {
        <div class="flex-1 flex flex-col items-center justify-center gap-5 text-center px-4">
          <p class="text-6xl">😵</p>
          <div class="space-y-1">
            <h2 class="text-xl font-semibold text-slate-200">Impossible de charger le défi</h2>
            <p class="text-slate-500 text-sm">Le serveur est peut-être indisponible.<br>Réessaie dans quelques secondes.</p>
          </div>
          <button
            (click)="retry()"
            class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors">
            Réessayer
          </button>
        </div>
      }

      <!-- Déjà joué aujourd'hui -->
      @if (gameState() === 'already_played') {
        <div class="flex-1 flex flex-col items-center justify-center gap-5 text-center px-4">
          <p class="text-6xl">✅</p>
          <div class="space-y-1">
            <h2 class="text-xl font-semibold text-slate-200">Déjà joué aujourd'hui !</h2>
            <p class="text-slate-500 text-sm">Tu as déjà relevé le défi du jour.<br>Reviens demain pour un nouveau blind test.</p>
          </div>
          <div class="bg-slate-800/60 rounded-2xl px-8 py-5 flex flex-col items-center gap-1">
            <p class="text-slate-500 text-xs uppercase tracking-widest">Prochain défi dans</p>
            <p class="text-4xl font-bold tabular-nums tracking-tight text-slate-100">{{ countdown() }}</p>
          </div>
        </div>
      }

      <!-- Jeu en cours -->
      @if (gameState() === 'playing' && currentTrack()) {
        <div class="flex-1">
          <app-blind-round
            #roundRef
            [track]="currentTrack()!"
            [isLast]="currentIndex() === tracks().length - 1"
            (answered)="onAnswered($event)"
            (nextTrack)="onNextTrack()" />
        </div>
      }

      <!-- Récapitulatif final -->
      @if (gameState() === 'done') {
        <div class="flex-1 flex flex-col pt-6 space-y-4 text-center">

          <div class="space-y-1">
            <p class="text-5xl">🏆</p>
            <h2 class="text-2xl font-bold">Défi terminé !</h2>
            <p class="text-6xl font-bold text-white pt-1">{{ totalScore() }}</p>
            <p class="text-slate-500 text-sm">points</p>
            <p class="text-slate-200 text-sm pt-2 animate-pulse">Reviens demain pour un nouveau défi 🎵</p>
          </div>

          <div class="w-full flex flex-col divide-y divide-slate-800">
            @for (r of results(); track r.position) {
              <div class="flex items-center gap-4 py-4">
                @if (r.coverUrl) {
                  <img [src]="r.coverUrl" alt="Pochette"
                    class="w-14 h-14 rounded-xl object-cover shrink-0" />
                } @else {
                  <div class="w-14 h-14 rounded-xl bg-slate-700 shrink-0"></div>
                }
                <div class="flex-1 min-w-0 text-left">
                  <div class="flex gap-3 text-base mb-1">
                    <span [class]="r.artistCorrect ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'">
                      {{ r.artistCorrect ? '✓' : '✗' }} Artiste
                    </span>
                    <span [class]="r.titleCorrect ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'">
                      {{ r.titleCorrect ? '✓' : '✗' }} Titre
                    </span>
                  </div>
                  <p class="text-slate-300 text-sm truncate">{{ r.correctArtist }} — {{ r.correctTitle }}</p>
                  <div class="flex gap-3 text-xs text-slate-600 mt-0.5">
                    <span>{{ r.listenedDurationSeconds }}s</span>
                    @if (r.averageSecondsWhenCorrect != null) {
                      <span>moy. {{ r.averageSecondsWhenCorrect!.toFixed(1) }}s</span>
                    }
                    <span>{{ r.failureRatePercent.toFixed(0) }}% ratés</span>
                  </div>
                </div>
                <span [class]="r.score > 0 ? 'text-emerald-400 font-bold text-lg shrink-0' : 'text-slate-500 font-bold text-lg shrink-0'">
                  +{{ r.score }}
                </span>
              </div>
            }
          </div>
        </div>
      }

      <footer class="flex justify-center py-2 mt-auto">
        <a routerLink="/admin" class="text-slate-700 hover:text-slate-500 text-xs transition">admin</a>
      </footer>

    </main>
    </div>
  `,
})
export class GameComponent implements OnInit, OnDestroy {
  private readonly gameService = inject(GameService);

  protected readonly gameState = signal<GameState>('loading');
  protected readonly tracks = signal<TrackSlot[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly totalScore = signal(0);
  protected readonly results = signal<Array<SubmitAnswerResponse & { position: number; coverUrl: string | null }>>([]);

  private sessionId = 0;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  protected readonly secondsUntilMidnightUtc = signal(0);
  protected readonly countdown = computed(() => {
    const s = this.secondsUntilMidnightUtc();
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  });

  protected readonly roundRef = viewChild<BlindRoundComponent>('roundRef');

  protected readonly currentTrack = () =>
    this.tracks()[this.currentIndex()] ?? null;

  ngOnInit(): void {
    this.loadSession();
  }

  ngOnDestroy(): void {
    if (this.countdownInterval !== null) clearInterval(this.countdownInterval);
  }

  private startCountdown(): void {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      this.secondsUntilMidnightUtc.set(Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000)));
    };
    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  protected retry(): void {
    this.gameState.set('loading');
    this.loadSession();
  }

  protected onAnswered(event: AnsweredEvent): void {
    this.gameService.submitAnswer(this.sessionId, {
      dailyChallengeTrackId:   event.trackId,
      listenedDurationSeconds: event.listenedDurationSeconds,
      wasExtended:             event.wasExtended,
      artistAnswer:            event.artistAnswer ?? undefined,
      titleAnswer:             event.titleAnswer ?? undefined,
    }).subscribe({
      next: (response) => {
        this.totalScore.update(s => s + response.score);
        this.results.update(rs => [
          ...rs,
          { ...response, position: this.currentIndex() + 1, coverUrl: this.tracks()[this.currentIndex()].coverUrl ?? null },
        ]);
        this.roundRef()?.setResult(response);

        // Précharger la piste suivante
        const next = this.tracks()[this.currentIndex() + 1];
        if (next) {
          // AudioPlayerService.preloadNext appelé depuis le composant enfant
        }
      },
      error: () => {
        // Erreur silencieuse — laisser l'utilisateur passer à la suite
        this.roundRef()?.setResult({
          artistCorrect: false,
          titleCorrect: false,
          score: 0,
          correctArtist: '?',
          correctTitle: '?',
          listenedDurationSeconds: 0,
          averageSecondsWhenCorrect: undefined,
          failureRatePercent: 0,
        });
      },
    });
  }

  protected onNextTrack(): void {
    const next = this.currentIndex() + 1;
    if (next >= this.tracks().length) {
      this.gameState.set('done');
    } else {
      this.currentIndex.set(next);
    }
  }

  private loadSession(): void {
    this.gameService.startToday().subscribe({
      next: (response) => {
        this.sessionId = response.sessionId;
        this.tracks.set(response.tracks);
        this.currentIndex.set(0);
        this.totalScore.set(0);
        this.results.set([]);
        this.gameState.set('playing');
      },
      error: (err) => {
        if (err.status === 409) {
          this.gameState.set('already_played');
          this.startCountdown();
        } else {
          this.gameState.set('error');
        }
      },
    });
  }
}

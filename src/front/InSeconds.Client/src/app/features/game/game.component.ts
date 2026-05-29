import { Component, inject, signal, viewChild, OnInit } from '@angular/core';
import { GameService } from '../../core/services/game.service';
import { TrackSlot, SubmitAnswerResponse } from '../../core/models/game.models';
import { BlindRoundComponent, AnsweredEvent } from './blind-round/blind-round.component';

type GameState = 'loading' | 'playing' | 'done' | 'error' | 'already_played';

@Component({
  selector: 'app-game',
  imports: [BlindRoundComponent],
  template: `
    <main class="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-950 to-black
                 text-slate-100 flex flex-col p-4 max-w-lg mx-auto">

      <!-- En-tête -->
      <header class="flex justify-between items-center py-4 mb-6">
        <h1 class="text-2xl font-bold tracking-tight">InSeconds 🎵</h1>
        @if (gameState() === 'playing') {
          <div class="text-right">
            <div class="text-sm text-slate-400">Piste {{ currentIndex() + 1 }} / {{ tracks().length }}</div>
            <div class="text-lg font-semibold">{{ totalScore() }} pts</div>
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
        <div class="flex-1 flex flex-col items-center justify-center space-y-4 text-center">
          <p class="text-rose-400">Impossible de charger le défi du jour.</p>
          <p class="text-slate-500 text-sm">Vérifie que le backend tourne sur localhost:5171.</p>
          <button
            (click)="retry()"
            class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition">
            Réessayer
          </button>
        </div>
      }

      <!-- Déjà joué aujourd'hui -->
      @if (gameState() === 'already_played') {
        <div class="flex-1 flex flex-col items-center justify-center text-center space-y-3">
          <p class="text-2xl">🎵</p>
          <p class="text-slate-300 font-semibold">Tu as déjà joué aujourd'hui !</p>
          <p class="text-slate-500 text-sm">Reviens demain pour un nouveau défi.</p>
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
        <div class="flex-1 flex flex-col items-center justify-center space-y-6 text-center">
          <p class="text-4xl">🏆</p>
          <h2 class="text-2xl font-bold">Défi terminé !</h2>
          <p class="text-slate-400">Score total</p>
          <p class="text-5xl font-bold text-white">{{ totalScore() }}</p>

          <div class="w-full space-y-2 mt-4">
            @for (r of results(); track r.position) {
              <div class="flex justify-between items-center px-4 py-2 rounded-lg bg-slate-800 text-sm">
                <span class="text-slate-400">Piste {{ r.position }}</span>
                <span>
                  <span [class]="r.artistCorrect ? 'text-emerald-400' : 'text-rose-400'">A</span>
                  <span class="text-slate-600 mx-1">/</span>
                  <span [class]="r.titleCorrect ? 'text-emerald-400' : 'text-rose-400'">T</span>
                </span>
                <span class="font-semibold">+{{ r.score }} pts</span>
              </div>
            }
          </div>
        </div>
      }

    </main>
  `,
})
export class GameComponent implements OnInit {
  private readonly gameService = inject(GameService);

  protected readonly gameState = signal<GameState>('loading');
  protected readonly tracks = signal<TrackSlot[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly totalScore = signal(0);
  protected readonly results = signal<Array<SubmitAnswerResponse & { position: number }>>([]);

  private sessionId = 0;

  protected readonly roundRef = viewChild<BlindRoundComponent>('roundRef');

  protected readonly currentTrack = () =>
    this.tracks()[this.currentIndex()] ?? null;

  ngOnInit(): void {
    this.loadSession();
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
      artistAnswer:            event.artistAnswer,
      titleAnswer:             event.titleAnswer,
    }).subscribe({
      next: (response) => {
        this.totalScore.update(s => s + response.score);
        this.results.update(rs => [
          ...rs,
          { ...response, position: this.currentIndex() + 1 },
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
        } else {
          this.gameState.set('error');
        }
      },
    });
  }
}

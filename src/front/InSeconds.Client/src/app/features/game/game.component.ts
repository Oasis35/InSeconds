import { Component, inject, signal, computed, viewChild, OnInit, OnDestroy, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../core/services/game.service';
import { AudioPlayerService } from '../../core/services/audio-player.service';
import { TrackSlot } from '../../core/models/game.models';
import { BlindRoundComponent, AnsweredEvent } from './blind-round/blind-round.component';
import { ApiClient, TodayStatsResponse } from '../../api/api.generated';
import { DeezerBadgeComponent } from '../../shared/deezer-badge.component';

type GameState = 'loading' | 'welcome' | 'playing' | 'done' | 'error' | 'no_challenge' | 'already_played';

interface RoundResult {
  artistCorrect: boolean;
  titleCorrect: boolean;
  score: number;
  correctArtist: string;
  correctTitle: string;
  listenedDurationSeconds: number;
  averageSecondsWhenCorrect: number | undefined;
  failureRatePercent: number;
  position: number;
  coverUrl: string | null;
  deezerTrackId: number;
}

@Component({
  selector: 'app-game',
  imports: [BlindRoundComponent, RouterLink, DeezerBadgeComponent],
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

      <!-- Accueil -->
      @if (gameState() === 'welcome') {
        <div class="flex-1 flex flex-col items-center justify-center gap-8 text-center px-4">
          <div class="space-y-3">
            <p class="text-7xl">🎵</p>
            <h2 class="text-3xl font-bold">Blind Test du jour</h2>
            <p class="text-slate-400 text-sm leading-relaxed">
              {{ tracks().length }} morceaux.<br>
              Choisis combien de secondes tu écoutes avant de deviner artiste et titre.<br>
              Moins tu écoutes, plus tu scores.
            </p>
          </div>
          <button
            (click)="startPlaying()"
            class="px-10 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-lg font-bold transition-all touch-manipulation shadow-lg shadow-indigo-900/40">
            Commencer à jouer
          </button>
        </div>
      }

      <!-- Pas de défi aujourd'hui -->
      @if (gameState() === 'no_challenge') {
        <div class="flex-1 flex flex-col items-center justify-center gap-5 text-center px-4">
          <p class="text-6xl">🎵</p>
          <div class="space-y-1">
            <h2 class="text-xl font-semibold text-slate-200">Pas de défi aujourd'hui</h2>
            <p class="text-slate-500 text-sm">Le défi du jour n'a pas encore été généré.<br>Réessaie dans quelques minutes.</p>
          </div>
          <button
            (click)="retry()"
            class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors">
            Réessayer
          </button>
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
        <div class="flex-1 flex flex-col items-center gap-5 text-center px-4 pt-6">
          <p class="text-6xl">✅</p>
          <div class="space-y-1">
            <h2 class="text-xl font-semibold text-slate-200">Déjà joué aujourd'hui !</h2>
            <p class="text-slate-400 text-sm tabular-nums">Prochain défi dans <span class="font-semibold text-slate-200">{{ countdown() }}</span></p>
          </div>

          <!-- Card scores côte à côte — masquée si écran trop petit -->
          @if (todayStats() && viewportTall()) {
            <div class="w-full bg-slate-800/60 rounded-2xl overflow-hidden">
              <div class="grid grid-cols-2 divide-x divide-slate-700">
                <div class="flex flex-col items-center py-5 px-4 gap-1">
                  <p class="text-slate-500 text-xs uppercase tracking-widest">Ton score</p>
                  <p class="text-4xl font-bold text-white tabular-nums">{{ todayStats()!.yourScore ?? '—' }}</p>
                  <p class="text-slate-500 text-xs">pts</p>
                </div>
                <div class="flex flex-col items-center py-5 px-4 gap-1">
                  <p class="text-slate-500 text-xs uppercase tracking-widest">Les joueurs font</p>
                  @if (todayStats()!.medianScore > 0) {
                    <p class="text-4xl font-bold text-slate-200 tabular-nums">{{ todayStats()!.medianScore }}</p>
                    <p class="text-slate-500 text-xs">pts aujourd'hui</p>
                  } @else {
                    <p class="text-slate-600 text-sm pt-2">pas encore de données</p>
                  }
                </div>
              </div>

              <!-- Bouton détail -->
              @if (todayStats()!.tracks.length) {
                <button (click)="showTrackDetails.set(!showTrackDetails())"
                        class="w-full flex items-center justify-center gap-2 py-3 border-t border-slate-700 text-sm text-slate-400 hover:text-slate-200 active:opacity-70 transition-colors">
                  <span>{{ showTrackDetails() ? 'Masquer le détail' : 'Voir le détail' }}</span>
                  <span class="text-xs">{{ showTrackDetails() ? '▲' : '▼' }}</span>
                </button>
                @if (showTrackDetails()) {
                  <div class="flex flex-col divide-y divide-slate-700 border-t border-slate-700">
                    @for (t of todayStats()!.tracks; track t.position) {
                      <a [href]="'https://www.deezer.com/track/' + t.deezerTrackId"
                         target="_blank" rel="noopener noreferrer"
                         class="flex items-center gap-3 px-4 py-3 hover:bg-slate-700/40 active:opacity-70 transition-colors">
                        @if (t.coverUrl) {
                          <img [src]="t.coverUrl" alt="Pochette"
                               class="w-10 h-10 rounded-lg object-cover shrink-0" />
                        } @else {
                          <div class="w-10 h-10 rounded-lg bg-slate-700 shrink-0"></div>
                        }
                        <div class="flex-1 min-w-0 text-left">
                          <p class="text-slate-200 text-sm font-medium truncate">{{ t.artist }} — {{ t.title }}</p>
                          <div class="flex gap-3 mt-0.5 text-xs text-slate-500">
                            <span>{{ t.failureRatePercent.toFixed(0) }}% ratés</span>
                            @if (t.averageSecondsWhenCorrect != null) {
                              <span>moy. {{ t.averageSecondsWhenCorrect!.toFixed(1) }}s</span>
                            }
                          </div>
                        </div>
                        <app-deezer-badge class="shrink-0" />
                      </a>
                    }
                  </div>
                }
              }
            </div>
          }

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
              <div class="flex gap-3 py-4">

                <!-- Pochette -->
                @if (r.coverUrl) {
                  <img [src]="r.coverUrl" alt="Pochette"
                    class="w-14 h-14 rounded-xl object-cover shrink-0" />
                } @else {
                  <div class="w-14 h-14 rounded-xl bg-slate-700 shrink-0"></div>
                }

                <!-- Infos + badge -->
                <div class="flex-1 min-w-0 text-left space-y-1">

                  <!-- Artiste / Titre trouvés -->
                  <div class="flex gap-3 text-sm font-semibold">
                    <span [class]="r.artistCorrect ? 'text-emerald-400' : 'text-rose-400'">
                      {{ r.artistCorrect ? '✓' : '✗' }} Artiste
                    </span>
                    <span [class]="r.titleCorrect ? 'text-emerald-400' : 'text-rose-400'">
                      {{ r.titleCorrect ? '✓' : '✗' }} Titre
                    </span>
                  </div>

                  <!-- Bonne réponse -->
                  <p class="text-slate-200 text-sm font-medium truncate">
                    {{ r.correctArtist }} — {{ r.correctTitle }}
                  </p>

                  <!-- Stats -->
                  <div class="flex gap-3 text-xs text-slate-500">
                    <span>{{ r.listenedDurationSeconds }}s écoutés</span>
                    @if (r.averageSecondsWhenCorrect != null) {
                      <span>· moy. {{ r.averageSecondsWhenCorrect!.toFixed(1) }}s</span>
                    }
                    <span>· {{ r.failureRatePercent.toFixed(0) }}% ratés</span>
                  </div>

                  <!-- Badge Deezer -->
                  <a [href]="'https://www.deezer.com/track/' + r.deezerTrackId"
                    target="_blank" rel="noopener noreferrer"
                    class="inline-block pt-1">
                    <app-deezer-badge />
                  </a>
                </div>

                <!-- Score -->
                <div class="shrink-0 text-right">
                  <span [class]="r.score > 0 ? 'text-emerald-400 font-bold text-lg' : 'text-slate-500 font-bold text-lg'">
                    +{{ r.score }}
                  </span>
                </div>

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
  private readonly api = inject(ApiClient);
  private readonly audioPlayer = inject(AudioPlayerService);

  protected readonly gameState = signal<GameState>('loading');
  protected readonly todayStats = signal<TodayStatsResponse | null>(null);
  protected readonly showTrackDetails = signal(false);
  protected readonly viewportTall = signal(window.innerHeight >= 600);

  @HostListener('window:resize')
  onResize(): void {
    this.viewportTall.set(window.innerHeight >= 600);
  }
  protected readonly tracks = signal<TrackSlot[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly totalScore = signal(0);
  protected readonly results = signal<RoundResult[]>([]);

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

  protected startPlaying(): void {
    this.gameState.set('playing');
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
        const track = this.tracks()[this.currentIndex()];
        this.results.update(rs => [...rs, {
          artistCorrect:             response.artistCorrect,
          titleCorrect:              response.titleCorrect,
          score:                     response.score,
          correctArtist:             response.correctArtist,
          correctTitle:              response.correctTitle,
          listenedDurationSeconds:   response.listenedDurationSeconds,
          averageSecondsWhenCorrect: response.averageSecondsWhenCorrect,
          failureRatePercent:        response.failureRatePercent,
          position:                  this.currentIndex() + 1,
          coverUrl:                  track.coverUrl ?? null,
          deezerTrackId:             track['deezerTrackId'],
        }]);
        this.roundRef()?.setResult(response);
      },
      error: () => {
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
        this.audioPlayer.preloadAll(response.tracks.map(t => t.previewUrl))
          .then(() => this.gameState.set('welcome'));
      },
      error: (err) => {
        if (err.status === 409) {
          this.gameState.set('already_played');
          this.startCountdown();
          this.api.apiStatsToday().subscribe(stats => this.todayStats.set(stats));
        } else if (err.status === 503) {
          this.gameState.set('no_challenge');
        } else {
          this.gameState.set('error');
        }
      },
    });
  }
}

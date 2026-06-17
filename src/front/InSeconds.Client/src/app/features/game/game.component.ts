import { Component, inject, signal, computed, viewChild, OnInit, OnDestroy, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../core/services/game.service';
import { AudioPlayerService } from '../../core/services/audio-player.service';
import { TrackSlot } from '../../core/models/game.models';
import { BlindRoundComponent, AnsweredEvent } from './blind-round/blind-round.component';
import { ApiClient, TodayStatsResponse } from '../../api/api.generated';
import { environment } from '../../../environments/environment';

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
  imports: [BlindRoundComponent, RouterLink],
  template: `
    <div class="min-h-dvh flex flex-col" style="background:#080810;color:#e2e8f0">
    <main class="flex-1 flex flex-col p-5 w-full max-w-lg mx-auto">

      <!-- En-tête -->
      <header class="pt-3 pb-6">
        <div class="flex items-center justify-center relative">
          <h1 class="text-lg font-semibold tracking-widest uppercase" style="color:#6366f1;letter-spacing:0.2em">InSeconds</h1>

          <!-- Streak header (tous les écrans sauf loading) -->
          @if (displayStreak() > 0 && gameState() !== 'loading' && gameState() !== 'playing') {
            <span class="absolute right-0 flex items-center gap-1 text-xs font-semibold tabular-nums"
                  style="color:#f59e0b">
              🔥 {{ displayStreak() }}
            </span>
          }

          <!-- Score en cours de partie (par-dessus streak si playing) -->
          @if (gameState() === 'playing') {
            <span class="absolute right-0 text-base font-bold tabular-nums" style="color:#f8fafc">
              {{ totalScore() }} <span style="color:#334155;font-weight:400;font-size:0.75rem">pts</span>
            </span>
          }
        </div>
        @if (gameState() === 'playing') {
          <div class="mt-4 space-y-1.5">
            <div class="flex justify-between text-xs" style="color:#334155">
              <span>Piste {{ currentIndex() + 1 }} / {{ tracks().length }}</span>
            </div>
            <div class="w-full rounded-full h-px" style="background:#1e1e2e">
              <div class="h-px rounded-full transition-all duration-500" style="background:#6366f1"
                [style.width.%]="(currentIndex() + 1) / tracks().length * 100">
              </div>
            </div>
          </div>
        }
      </header>

      <!-- Chargement -->
      @if (gameState() === 'loading') {
        <div class="flex-1 flex items-center justify-center">
          <p class="text-sm animate-pulse" style="color:#334155">Chargement du défi…</p>
        </div>
      }

      <!-- Accueil -->
      @if (gameState() === 'welcome') {
        <div class="flex-1 flex flex-col items-center justify-center gap-10 text-center px-2">

          <div class="space-y-4">
            <p class="text-6xl" style="line-height:1">♪</p>
            <h2 class="text-3xl font-bold tracking-tight" style="color:#f8fafc">Blind Test du jour</h2>
            <p class="text-sm leading-relaxed" style="color:#475569">
              {{ tracks().length }} morceaux · écoute &amp; devine<br>
              Moins tu écoutes, plus tu scores
            </p>
          </div>

          <button
            (click)="startPlaying()"
            class="w-full py-4 rounded-2xl font-bold text-base tracking-wide transition-all active:scale-95 touch-manipulation"
            style="background:#6366f1;color:#fff;letter-spacing:0.04em">
            Commencer
          </button>
        </div>
      }

      <!-- Pas de défi aujourd'hui -->
      @if (gameState() === 'no_challenge') {
        <div class="flex-1 flex flex-col items-center justify-center gap-6 text-center px-4">
          <div class="space-y-2">
            <h2 class="text-xl font-semibold" style="color:#e2e8f0">Pas de défi aujourd'hui</h2>
            <p class="text-sm" style="color:#334155">Le défi n'a pas encore été généré.<br>Réessaie dans quelques minutes.</p>
          </div>
          <button (click)="retry()"
            class="px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
            style="background:#1e1e2e;color:#94a3b8;border:1px solid rgba(255,255,255,0.06)">
            Réessayer
          </button>
        </div>
      }

      <!-- Erreur -->
      @if (gameState() === 'error') {
        <div class="flex-1 flex flex-col items-center justify-center gap-6 text-center px-4">
          <div class="space-y-2">
            <h2 class="text-xl font-semibold" style="color:#e2e8f0">Impossible de charger le défi</h2>
            <p class="text-sm" style="color:#334155">Le serveur est peut-être indisponible.<br>Réessaie dans quelques secondes.</p>
          </div>
          <button (click)="retry()"
            class="px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
            style="background:#1e1e2e;color:#94a3b8;border:1px solid rgba(255,255,255,0.06)">
            Réessayer
          </button>
        </div>
      }

      <!-- Déjà joué aujourd'hui -->
      @if (gameState() === 'already_played') {
        <div class="flex-1 flex flex-col items-center gap-7 text-center px-2 pt-4">

          <!-- Titre -->
          <div class="space-y-3">
            <h2 class="text-2xl font-bold tracking-tight" style="color:#f8fafc">Déjà joué aujourd'hui</h2>
            <div>
              <p class="text-xs font-semibold tracking-widest uppercase mb-1" style="color:#475569">Prochain défi dans</p>
              <p class="text-3xl font-bold tabular-nums" style="color:#e2e8f0;letter-spacing:0.05em">{{ countdown() }}</p>
            </div>
          </div>

          <!-- Card scores -->
          @if (todayStats()) {
            <div class="w-full rounded-2xl overflow-hidden" style="background:#0f0f1a;border:1px solid rgba(255,255,255,0.07)">

              <div class="grid grid-cols-2" style="border-bottom:1px solid rgba(255,255,255,0.07)">
                <div class="flex flex-col items-center py-7 px-4" style="border-right:1px solid rgba(255,255,255,0.07)">
                  <p class="text-xs font-semibold tracking-widest uppercase mb-2" style="color:#334155">Ton score</p>
                  <p class="text-5xl font-bold tabular-nums" style="color:#f8fafc;letter-spacing:-0.02em">{{ todayStats()!.yourScore ?? '—' }}</p>
                  <p class="text-xs mt-2" style="color:#334155">pts</p>
                </div>
                <div class="flex flex-col items-center py-7 px-4">
                  <p class="text-xs font-semibold tracking-widest uppercase mb-2" style="color:#334155">Médiane</p>
                  @if (todayStats()!.medianScore > 0) {
                    <p class="text-5xl font-bold tabular-nums" style="color:#475569;letter-spacing:-0.02em">{{ todayStats()!.medianScore }}</p>
                    <p class="text-xs mt-2" style="color:#334155">pts aujourd'hui</p>
                  } @else {
                    <p class="text-sm mt-4" style="color:#1e293b">—</p>
                  }
                </div>
              </div>

              <!-- Accordion morceaux -->
              @if (todayStats()!.tracks.length) {
                <button (click)="showTrackDetails.set(!showTrackDetails())"
                        class="w-full flex items-center justify-center gap-2 py-3.5 text-xs font-semibold tracking-wide uppercase transition-colors"
                        style="color:#334155"
                        onmouseenter="this.style.color='#64748b'" onmouseleave="this.style.color='#334155'">
                  <span>{{ showTrackDetails() ? 'Masquer' : 'Voir les morceaux' }}</span>
                  <span>{{ showTrackDetails() ? '▲' : '▼' }}</span>
                </button>
                @if (showTrackDetails()) {
                  <div class="flex flex-col" style="border-top:1px solid rgba(255,255,255,0.07)">
                    @for (t of todayStats()!.tracks; track t.position) {
                      <a [href]="'https://www.deezer.com/track/' + t.deezerTrackId"
                         target="_blank" rel="noopener noreferrer"
                         class="flex items-center gap-3 px-4 py-3.5 transition-colors"
                         style="border-bottom:1px solid rgba(255,255,255,0.04)"
                         onmouseenter="this.style.background='rgba(255,255,255,0.02)'"
                         onmouseleave="this.style.background='transparent'">
                        @if (t.coverUrl) {
                          <img [src]="t.coverUrl" alt="Pochette"
                               class="w-9 h-9 rounded-lg object-cover shrink-0" style="opacity:0.85" />
                        } @else {
                          <div class="w-9 h-9 rounded-lg shrink-0" style="background:#1a1a2e"></div>
                        }
                        <div class="flex-1 min-w-0 text-left">
                          <p class="text-sm font-medium truncate" style="color:#cbd5e1">{{ t.artist }} — {{ t.title }}</p>
                          <div class="flex gap-3 mt-0.5 text-xs" style="color:#334155">
                            <span>{{ t.failureRatePercent.toFixed(0) }}% ratés</span>
                            @if (t.averageSecondsWhenCorrect != null) {
                              <span>· moy. {{ t.averageSecondsWhenCorrect!.toFixed(1) }}s</span>
                            }
                          </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="opacity:0.2;shrink:0">
                          <path d="M2 11h2v1H2zM6 9h2v3H6zM10 7h2v5h-2zM14 5h2v7h-2z" fill="white"/>
                        </svg>
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
        <div class="flex-1 flex flex-col justify-start pt-4">
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
        <div class="flex-1 flex flex-col pt-4 gap-6">

          <!-- Score total -->
          <div class="text-center space-y-2 pb-2">
            <p class="text-xs font-semibold tracking-widest uppercase" style="color:#64748b">Score final</p>
            <p class="font-bold tabular-nums" style="color:#f8fafc;font-size:4rem;line-height:1;letter-spacing:-0.03em">{{ totalScore() }}</p>
            <p class="text-xs" style="color:#64748b">points</p>
          </div>

          <!-- Bouton partage -->
          <div class="flex flex-col items-center gap-1.5">
            <button
              (click)="share()"
              class="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition touch-manipulation"
              style="background:#1e1e2e;color:#e2e8f0;border:1px solid rgba(255,255,255,0.08);letter-spacing:0.03em">
              {{ shareCopied() ? '✓ Copié !' : '🔗 Partager mon score' }}
            </button>
            <p class="text-xs" style="color:#475569">Copie un résumé en emojis dans le presse-papier</p>
          </div>

          <!-- Liste morceaux -->
          <div class="flex flex-col gap-3">
            @for (r of results(); track r.position) {
              <div class="flex gap-3 p-3 rounded-2xl" style="background:#0f0f1a;border:1px solid rgba(255,255,255,0.08)">

                <!-- Pochette -->
                @if (r.coverUrl) {
                  <img [src]="r.coverUrl" alt="Pochette"
                    class="w-14 h-14 rounded-xl object-cover shrink-0" style="opacity:0.9" />
                } @else {
                  <div class="w-14 h-14 rounded-xl shrink-0" style="background:#1a1a2e"></div>
                }

                <!-- Infos -->
                <div class="flex-1 min-w-0 text-left space-y-1.5 py-0.5">

                  <div class="flex gap-2.5 text-xs font-bold">
                    <span [style.color]="r.artistCorrect ? '#34d399' : '#f87171'">
                      {{ r.artistCorrect ? '✓' : '✗' }} Artiste
                    </span>
                    <span [style.color]="r.titleCorrect ? '#34d399' : '#f87171'">
                      {{ r.titleCorrect ? '✓' : '✗' }} Titre
                    </span>
                  </div>

                  <p class="text-sm font-medium truncate" style="color:#e2e8f0">
                    {{ r.correctArtist }} — {{ r.correctTitle }}
                  </p>

                  <div class="flex gap-2.5 text-xs" style="color:#64748b">
                    <span>{{ r.listenedDurationSeconds }}s</span>
                    @if (r.averageSecondsWhenCorrect != null) {
                      <span>· moy. {{ r.averageSecondsWhenCorrect!.toFixed(1) }}s</span>
                    }
                    <span>· {{ r.failureRatePercent.toFixed(0) }}% ratés</span>
                  </div>

                  <a [href]="'https://www.deezer.com/track/' + r.deezerTrackId"
                    target="_blank" rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs transition-colors"
                    style="color:#475569"
                    onmouseenter="this.style.color='#94a3b8'" onmouseleave="this.style.color='#475569'">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 11h2v1H2zM6 9h2v3H6zM10 7h2v5h-2zM14 5h2v7h-2z" fill="currentColor"/></svg>
                    Écouter sur Deezer
                  </a>
                </div>

                <!-- Score -->
                <div class="shrink-0 text-right self-center">
                  <span class="text-lg font-bold" [style.color]="r.score > 0 ? '#34d399' : '#64748b'">
                    +{{ r.score }}
                  </span>
                </div>

              </div>
            }
          </div>

          <p class="text-center text-xs pb-4" style="color:#475569">Reviens demain pour un nouveau défi</p>
        </div>
      }

      <footer class="flex justify-center py-3 mt-auto">
        <a routerLink="/admin" class="text-xs transition-colors" style="color:#1a1a2e"
           onmouseenter="this.style.color='#334155'" onmouseleave="this.style.color='#1a1a2e'">admin</a>
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
  protected readonly currentStreak = signal(0);

  // Streak à afficher : depuis la session (welcome/playing/done) ou depuis les stats (already_played)
  protected readonly displayStreak = computed(() => {
    const stats = this.todayStats();
    if (this.gameState() === 'already_played' && stats) return (stats as any)['currentStreak'] as number;
    return this.currentStreak();
  });

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

  protected readonly shareCopied = signal(false);

  protected share(): void {
    const date = new Date();
    const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;

    const colorEmoji = (secs: number) => secs <= 1 ? '🟩' : secs <= 3 ? '🟨' : '🟥';

    const lines = this.results().map(r => {
      const color  = colorEmoji(Number(r.listenedDurationSeconds));
      const artist = r.artistCorrect ? color : '⬜';
      const title  = r.titleCorrect  ? color : '⬜';
      return `${artist} ${title} ${r.listenedDurationSeconds}s`;
    });

    const text = [
      `InSeconds 🎵 ${dateStr}`,
      lines.join('\n'),
      `🏆 ${this.totalScore()} pts`,
      `${environment.appUrl}/blindtest`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 2000);
    });
  }

  private loadSession(): void {
    this.gameService.startToday().subscribe({
      next: (response) => {
        this.sessionId = response.sessionId;
        this.tracks.set(response.tracks);
        this.currentIndex.set(0);
        this.totalScore.set(0);
        this.results.set([]);
        this.currentStreak.set(response.currentStreak);
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

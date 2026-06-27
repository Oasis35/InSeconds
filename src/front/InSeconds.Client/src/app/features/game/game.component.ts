import { Component, inject, signal, computed, effect, viewChild, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../core/services/game.service';
import { AudioPlayerService } from '../../core/services/audio-player.service';
import { TrackSlot, ResumedAnswer } from '../../core/models/game.models';
import { BlindRoundComponent, AnsweredEvent } from './blind-round/blind-round.component';
import { ConfirmSheetComponent } from '../../shared/confirm-sheet/confirm-sheet.component';
import { ApiClient, TodayStatsResponse } from '../../api/api.generated';
import { environment } from '../../../environments/environment';
import { UnsavedGameComponent } from '../../core/guards/unsaved-game.guard';
import { countUp } from '../../core/count-up';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService, Lang } from '../../core/services/language.service';

type GameState = 'loading' | 'welcome' | 'resume_prompt' | 'playing' | 'done' | 'error' | 'no_challenge' | 'already_played';

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
  imports: [BlindRoundComponent, ConfirmSheetComponent, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './game.component.html',
})
export class GameComponent implements OnInit, OnDestroy, UnsavedGameComponent {
  private readonly gameService = inject(GameService);
  private readonly api = inject(ApiClient);
  private readonly audioPlayer = inject(AudioPlayerService);
  private readonly translate = inject(TranslateService);
  protected readonly language = inject(LanguageService);

  protected setLang(lang: Lang): void {
    this.language.use(lang);
  }

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
  protected readonly displayedTotalScore = signal(0);
  protected readonly results = signal<RoundResult[]>([]);
  protected readonly currentStreak = signal(0);

  // Reprise
  protected readonly resumeCompletedAnswers = signal<ResumedAnswer[]>([]);
  protected readonly showAbandonConfirm = signal(false);
  protected readonly abandonLoading = signal(false);
  protected readonly sessionAbandoned = signal(false);

  // Streak à afficher : depuis la session (welcome/playing/done) ou depuis les stats (already_played)
  protected readonly displayStreak = computed(() => {
    const stats = this.todayStats();
    if (this.gameState() === 'already_played' && stats) return (stats as any)['currentStreak'] as number;
    return this.currentStreak();
  });

  protected sessionId = 0;
  protected readonly currentTrackMinListenedSeconds = signal<number | null>(null);
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
    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const state = this.gameState();
        if (state === 'welcome' || state === 'resume_prompt' || state === 'playing') {
          this.loadSession();
        }
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    if (this.countdownInterval !== null) clearInterval(this.countdownInterval);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onVisibilityChange!: () => void;

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

  protected resumePlaying(): void {
    const completed = this.resumeCompletedAnswers();
    this.currentIndex.set(Math.max(0, completed.length));
    this.totalScore.set(completed.reduce((s, a) => s + a.score, 0));
    // Reconstituer les RoundResult pour les morceaux déjà joués (récap final complet)
    this.results.set(completed.map((a, i) => {
      const track = this.tracks()[i];
      return {
        artistCorrect:             a.artistCorrect,
        titleCorrect:              a.titleCorrect,
        score:                     a.score,
        correctArtist:             a.correctArtist ?? '',
        correctTitle:              a.correctTitle ?? '',
        listenedDurationSeconds:   a.listenedDurationSeconds,
        averageSecondsWhenCorrect: undefined,
        failureRatePercent:        0,
        position:                  a.position,
        coverUrl:                  track?.coverUrl ?? null,
        deezerTrackId:             track?.deezerTrackId ?? 0,
      };
    }));
    this.gameState.set('playing');
  }

  protected requestAbandon(): void {
    this.showAbandonConfirm.set(true);
  }

  protected confirmAbandon(): void {
    this.abandonLoading.set(true);
    this.gameService.abandonSession(this.sessionId).subscribe({
      next: () => {
        this.abandonLoading.set(false);
        this.showAbandonConfirm.set(false);
        this.sessionAbandoned.set(true);
        this.gameState.set('already_played');
        this.startCountdown();
      },
      error: () => {
        this.abandonLoading.set(false);
      },
    });
  }

  protected retry(): void {
    this.gameState.set('loading');
    this.loadSession();
  }

  protected onAnswered(event: AnsweredEvent): void {
    const index = this.currentIndex();
    const track = this.tracks()[index];
    this.gameService.submitAnswer(this.sessionId, {
      dailyChallengeTrackId:   event.trackId,
      listenedDurationSeconds: event.listenedDurationSeconds,
      wasExtended:             event.wasExtended,
      artistAnswer:            event.artistAnswer ?? undefined,
      titleAnswer:             event.titleAnswer ?? undefined,
    }).subscribe({
      next: (response) => {
        this.totalScore.update(s => s + response.score);
        this.results.update(rs => [...rs, {
          artistCorrect:             response.artistCorrect,
          titleCorrect:              response.titleCorrect,
          score:                     response.score,
          correctArtist:             response.correctArtist,
          correctTitle:              response.correctTitle,
          listenedDurationSeconds:   response.listenedDurationSeconds,
          averageSecondsWhenCorrect: response.averageSecondsWhenCorrect,
          failureRatePercent:        response.failureRatePercent,
          position:                  index + 1,
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
        }, true);
      },
    });
  }

  protected onNextTrack(): void {
    const next = this.currentIndex() + 1;
    this.currentTrackMinListenedSeconds.set(null);
    if (next >= this.tracks().length) {
      this.gameState.set('done');
      this.displayedTotalScore.set(0);
      countUp(this.totalScore(), v => this.displayedTotalScore.set(v), 1000);
    } else {
      this.currentIndex.set(next);
    }
  }

  protected readonly showLeaveConfirm = signal(false);
  private leaveResolve: ((ok: boolean) => void) | null = null;

  constructor() {
    // Si la partie quitte l'état 'playing' (terminée/abandonnée en arrière-plan,
    // ex. dernière réponse HTTP qui se résout) pendant qu'une confirmation de
    // sortie est ouverte, on laisse la navigation se faire — il n'y a plus de
    // partie à protéger.
    effect(() => {
      if (this.gameState() !== 'playing' && this.leaveResolve) {
        this.resolveLeave(true);
      }
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.gameState() === 'playing') {
      event.preventDefault();
    }
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (this.gameState() !== 'playing') return true;
    // Une confirmation déjà en attente (navigation ré-entrante) : on la résout
    // avant d'en ouvrir une nouvelle pour ne pas laisser de Promise orpheline.
    this.resolveLeave(false);
    this.showLeaveConfirm.set(true);
    return new Promise<boolean>(resolve => {
      this.leaveResolve = resolve;
    });
  }

  private resolveLeave(ok: boolean): void {
    this.showLeaveConfirm.set(false);
    const resolve = this.leaveResolve;
    this.leaveResolve = null;
    resolve?.(ok);
  }

  protected confirmLeave(): void {
    this.resolveLeave(true);
  }

  protected cancelLeave(): void {
    this.resolveLeave(false);
  }

  protected readonly shareCopied = signal(false);

  protected shareFromStats(): void {
    const stats = this.todayStats();
    if (!stats) return;

    const date = new Date();
    const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    const lines = stats.tracks.map(t => {
      if (t.listenedDurationSeconds == null) return null;
      const artist = t.artistCorrect ? '✅' : '❌';
      const title  = t.titleCorrect  ? '✅' : '❌';
      return `${artist}/${title} ${t.listenedDurationSeconds}s`;
    }).filter(Boolean);

    const text = [
      this.translate.instant('share.title', { date: dateStr }),
      lines.join('\n'),
      this.translate.instant('share.score', { score: stats.yourScore }),
      environment.appUrl,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 2000);
    });
  }

  protected share(): void {
    const date = new Date();
    const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;

    const lines = this.results().map(r => {
      const artist = r.artistCorrect ? '✅' : '❌';
      const title  = r.titleCorrect  ? '✅' : '❌';
      return `${artist}/${title} ${r.listenedDurationSeconds}s`;
    });

    const text = [
      this.translate.instant('share.title', { date: dateStr }),
      lines.join('\n'),
      this.translate.instant('share.score', { score: this.totalScore() }),
      environment.appUrl,
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
        this.currentStreak.set(response.currentStreak);

        if (response.isResuming) {
          this.resumeCompletedAnswers.set(response.completedAnswers);
          this.currentIndex.set(response.resumeFromPosition);
          this.totalScore.set(response.completedAnswers.reduce((s, a) => s + a.score, 0));
          this.results.set([]);
          this.showAbandonConfirm.set(false);
          // Anti-cheat : si la session reprend sur une track déjà commencée, verrouiller le palier min
          const resumeTrack = response.tracks[response.resumeFromPosition];
          this.currentTrackMinListenedSeconds.set(
            response.currentTrackId != null && resumeTrack?.id === response.currentTrackId && response.minListenedSeconds != null
              ? response.minListenedSeconds
              : null
          );
          this.audioPlayer.preloadAll(response.tracks.map(t => t.previewUrl))
            .then(() => this.gameState.set('resume_prompt'));
        } else {
          this.currentIndex.set(0);
          this.totalScore.set(0);
          this.results.set([]);
          this.currentTrackMinListenedSeconds.set(null);
          this.audioPlayer.preloadAll(response.tracks.map(t => t.previewUrl))
            .then(() => this.gameState.set('welcome'));
        }
      },
      error: (err) => {
        if (err.status === 409) {
          const errorCode = err.error?.error as string | undefined;
          this.sessionAbandoned.set(errorCode === 'abandoned');
          this.gameState.set('already_played');
          this.startCountdown();
          if (!this.sessionAbandoned()) {
            this.api.apiStatsToday().subscribe(stats => this.todayStats.set(stats));
          }
        } else if (err.status === 503) {
          this.gameState.set('no_challenge');
        } else {
          this.gameState.set('error');
        }
      },
    });
  }
}

import { Component, inject, signal, computed, effect, viewChild, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AudioPlayerService } from '../../core/services/audio-player.service';
import { ClipboardService } from '../../core/services/clipboard.service';
import { GameFacadeService } from './services/game-facade.service';
import { TrackSlot, ResumedAnswer } from '../../core/models/game.models';
import { BlindRoundComponent, AnsweredEvent } from './blind-round/blind-round.component';
import { ConfirmSheetComponent } from '../../shared/confirm-sheet/confirm-sheet.component';
import { ApiClient, TodayStatsResponse } from '../../api/api.generated';
import { environment } from '../../../environments/environment';
import { UnsavedGameComponent } from '../../core/guards/unsaved-game.guard';
import { countUp } from '../../core/count-up';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WelcomeScreenComponent } from './screens/welcome-screen/welcome-screen.component';
import { ResumeScreenComponent } from './screens/resume-screen/resume-screen.component';
import { StatusScreenComponent } from './screens/status-screen/status-screen.component';
import { AlreadyPlayedScreenComponent } from './screens/already-played-screen/already-played-screen.component';
import { FinalRecapScreenComponent, RoundResult } from './screens/final-recap-screen/final-recap-screen.component';
import { GameHeaderComponent } from './components/game-header/game-header.component';
import { GameFooterComponent } from './components/game-footer/game-footer.component';
import { DecorBackgroundComponent } from '../../shared/decor-background/decor-background.component';

type GameState = 'loading' | 'welcome' | 'resume_prompt' | 'playing' | 'done' | 'error' | 'no_challenge' | 'already_played';

@Component({
  selector: 'app-game',
  imports: [
    BlindRoundComponent, ConfirmSheetComponent, TranslatePipe,
    WelcomeScreenComponent, ResumeScreenComponent, StatusScreenComponent,
    AlreadyPlayedScreenComponent, FinalRecapScreenComponent,
    GameHeaderComponent, GameFooterComponent, DecorBackgroundComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game.component.html',
  providers: [GameFacadeService],
})
export class GameComponent implements OnInit, OnDestroy, UnsavedGameComponent {
  private readonly gameService = inject(GameFacadeService);
  private readonly api = inject(ApiClient);
  private readonly audioPlayer = inject(AudioPlayerService);
  private readonly clipboard = inject(ClipboardService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly gameState = signal<GameState>('loading');
  protected readonly todayStats = signal<TodayStatsResponse | null>(null);
  // Renseignés par le peek (GET /api/sessions/today) avant toute création de session :
  // l'écran d'accueil / de reprise s'affiche sans qu'aucun POST /api/sessions n'ait eu lieu.
  protected readonly peekTracksCount = signal(0);
  protected readonly peekCompletedCount = signal(0);
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
    this.peekSession('initial');
    this.onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const state = this.gameState();
      if (state === 'welcome' || state === 'resume_prompt') {
        this.peekSession('refocus');
      } else if (state === 'playing') {
        // Détecte une complétion/abandon dans un autre onglet sans relancer de POST.
        this.peekSession('playing');
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
    if (this.countdownInterval !== null) return;
    const tick = () => {
      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      this.secondsUntilMidnightUtc.set(Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000)));
    };
    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  private startPlaying(): void {
    this.gameState.set('playing');
  }

  /** Écran d'accueil → clic « Commencer à jouer » : c'est ICI qu'on crée la session (POST). */
  protected beginGame(): void {
    this.gameState.set('loading');
    this.loadSession();
  }

  /** Écran de reprise → clic « Reprendre » : POST (le back renvoie l'état de reprise). */
  protected beginResume(): void {
    this.gameState.set('loading');
    this.loadSession();
  }

  /**
   * Écran de reprise → clic « Abandonner » : il faut d'abord matérialiser la session
   * (POST, renvoie son id) avant de pouvoir l'abandonner.
   */
  protected beginAbandonFromResume(): void {
    this.abandonLoading.set(true);
    this.gameService.startToday().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.sessionId = res.sessionId;
        this.confirmAbandon();
      },
      error: () => this.abandonLoading.set(false),
    });
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
    this.gameService.abandonSession(this.sessionId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    this.peekSession('initial');
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
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
          guessTimeDistribution: [],
          notFoundCount: 0,
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
      this.startCountdown();
      // Stats du jour → histogrammes par morceau dans le récap (popup au clic sur un score).
      this.api.apiStatsToday().pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(stats => this.todayStats.set(stats));
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
  protected readonly shareFailed = signal(false);

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

    this.copyToClipboard(text);
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

    this.copyToClipboard(text);
  }

  private copyToClipboard(text: string): void {
    this.clipboard.copy(text).then(ok => {
      if (ok) {
        this.shareCopied.set(true);
        setTimeout(() => this.shareCopied.set(false), 2000);
      } else {
        this.shareFailed.set(true);
        setTimeout(() => this.shareFailed.set(false), 3000);
      }
    });
  }

  private loadSession(): void {
    this.gameService.startToday().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
          // Le joueur a explicitement cliqué « Reprendre » → on enchaîne directement
          // sur la partie (reconstruction du récap incluse), pas de retour à l'écran de reprise.
          this.audioPlayer.preloadAll(response.tracks.map(t => t.previewUrl))
            .then(() => this.resumePlaying());
        } else {
          this.currentIndex.set(0);
          this.totalScore.set(0);
          this.results.set([]);
          this.currentTrackMinListenedSeconds.set(null);
          // Le joueur a explicitement cliqué « Commencer à jouer » → on entre dans la partie.
          this.audioPlayer.preloadAll(response.tracks.map(t => t.previewUrl))
            .then(() => this.startPlaying());
        }
      },
      error: (err) => {
        if (err.status === 409) {
          const errorCode = err.error?.error as string | undefined;
          this.sessionAbandoned.set(errorCode === 'abandoned');
          this.gameState.set('already_played');
          this.startCountdown();
          if (!this.sessionAbandoned()) {
            this.api.apiStatsToday().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(stats => this.todayStats.set(stats));
          }
        } else if (err.status === 503) {
          this.gameState.set('no_challenge');
        } else {
          this.gameState.set('error');
        }
      },
    });
  }

  /**
   * Lecture seule (GET /api/sessions/today) : détermine l'écran à afficher SANS créer
   * de session ni de cookie joueur. `context` :
   *  - 'initial'  : premier chargement / retry
   *  - 'refocus'  : retour au premier plan depuis welcome/resume_prompt
   *  - 'playing'  : retour au premier plan pendant une partie — on ne bascule QUE si la
   *                 partie a été terminée/abandonnée ailleurs (jamais vers welcome/resume).
   */
  private peekSession(context: 'initial' | 'refocus' | 'playing'): void {
    this.gameService.peekToday().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.currentStreak.set(res.currentStreak);
        this.peekTracksCount.set(res.tracksCount);
        this.peekCompletedCount.set(res.completedCount);

        switch (res.state) {
          case 'can_start':
            if (context !== 'playing') this.gameState.set('welcome');
            break;
          case 'resumable':
            if (context !== 'playing') this.gameState.set('resume_prompt');
            break;
          case 'already_played':
            this.sessionAbandoned.set(false);
            this.gameState.set('already_played');
            this.startCountdown();
            this.api.apiStatsToday().pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe(stats => this.todayStats.set(stats));
            break;
          case 'abandoned':
            this.sessionAbandoned.set(true);
            this.gameState.set('already_played');
            this.startCountdown();
            break;
          case 'no_challenge':
          default:
            if (context !== 'playing') this.gameState.set('no_challenge');
            break;
        }
      },
      error: () => {
        if (context !== 'playing') this.gameState.set('error');
      },
    });
  }
}

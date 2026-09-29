import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, tap } from 'rxjs';
import { ApiClient, TodayStatsResponse } from '../../api/api.generated';
import { AudioPlayerService } from '../../core/services/audio-player.service';
import { PlayerSessionService } from '../../core/services/player-session.service';
import { ResumedAnswer, StartSessionResponse, StreakDto, SubmitAnswerResponse, TrackSlot } from '../../core/models/game.models';
import { dateKey, emptyStreak, pluralKey } from '../../core/models/streak';
import { countUp } from '../../core/count-up';
import { GameFacadeService, LoadOutcome } from './services/game-facade.service';
import { AnsweredEvent } from './blind-round/blind-round.component';
import { RoundResult } from './screens/final-recap-screen/final-recap-screen.component';

// Toast invité « série perdue » : une seule fois par série perdue (clé = date du dernier défi joué).
const LOST_STREAK_SEEN_KEY = 'inseconds.lostStreakNudgeSeen';

export type GameState = 'loading' | 'welcome' | 'resume_prompt' | 'playing' | 'done' | 'error' | 'no_challenge' | 'already_played';

/**
 * Contexte d'un peek (GET /api/sessions/today) :
 *  - 'initial'  : premier chargement / retry
 *  - 'refocus'  : retour au premier plan depuis welcome/resume_prompt
 *  - 'playing'  : retour au premier plan pendant une partie — on ne bascule QUE si la
 *                 partie a été terminée/abandonnée ailleurs (jamais vers welcome/resume).
 */
type PeekContext = 'initial' | 'refocus' | 'playing';

/**
 * Store de la partie du jour (fourni par `GameComponent`) : porte tout l'état du jeu et la
 * machine à états (`state`). L'état n'est exposé qu'en lecture seule ; il ne change que par
 * les transitions nommées ci-dessous. Le composant ne garde que l'affichage (panneau série,
 * hauteur d'écran, confirmation de sortie) et le lien avec le round en cours.
 */
@Injectable()
export class GameStore {
  private readonly facade = inject(GameFacadeService);
  private readonly api = inject(ApiClient);
  private readonly audioPlayer = inject(AudioPlayerService);
  private readonly playerSession = inject(PlayerSessionService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _state = signal<GameState>('loading');
  private readonly _sessionId = signal(0);
  private readonly _tracks = signal<TrackSlot[]>([]);
  private readonly _currentIndex = signal(0);
  private readonly _totalScore = signal(0);
  private readonly _displayedTotalScore = signal(0);
  private readonly _results = signal<RoundResult[]>([]);
  private readonly _currentStreak = signal(0);
  private readonly _currentTrackMinListenedSeconds = signal<number | null>(null);
  private readonly _todayStats = signal<TodayStatsResponse | null>(null);

  // Renseignés par le peek (GET /api/sessions/today) avant toute création de session :
  // l'écran d'accueil / de reprise s'affiche sans qu'aucun POST /api/sessions n'ait eu lieu.
  private readonly _peekTracksCount = signal(0);
  private readonly _peekCompletedCount = signal(0);

  // Reprise / abandon
  private readonly _resumeCompletedAnswers = signal<ResumedAnswer[]>([]);
  private readonly _showAbandonConfirm = signal(false);
  private readonly _abandonLoading = signal(false);
  private readonly _sessionAbandoned = signal(false);

  // Gel de série : détail série/gels du peek (rafraîchi après la dernière réponse d'une partie).
  private readonly _streakInfo = signal<StreakDto | null>(null);
  /** Série perdue à afficher dans le toast invité (null = pas de toast). */
  private readonly _lostStreak = signal<number | null>(null);
  private readonly _streakToastDismissed = signal(false);
  private readonly _gelToastDismissed = signal(false);

  private readonly _secondsUntilMidnightUtc = signal(0);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  readonly state = this._state.asReadonly();
  readonly sessionId = this._sessionId.asReadonly();
  readonly tracks = this._tracks.asReadonly();
  readonly currentIndex = this._currentIndex.asReadonly();
  readonly totalScore = this._totalScore.asReadonly();
  readonly displayedTotalScore = this._displayedTotalScore.asReadonly();
  readonly results = this._results.asReadonly();
  readonly currentTrackMinListenedSeconds = this._currentTrackMinListenedSeconds.asReadonly();
  readonly todayStats = this._todayStats.asReadonly();
  readonly peekTracksCount = this._peekTracksCount.asReadonly();
  readonly peekCompletedCount = this._peekCompletedCount.asReadonly();
  readonly resumeCompletedAnswers = this._resumeCompletedAnswers.asReadonly();
  readonly showAbandonConfirm = this._showAbandonConfirm.asReadonly();
  readonly abandonLoading = this._abandonLoading.asReadonly();
  readonly sessionAbandoned = this._sessionAbandoned.asReadonly();
  readonly streakInfo = this._streakInfo.asReadonly();
  readonly lostStreak = this._lostStreak.asReadonly();
  readonly streakToastDismissed = this._streakToastDismissed.asReadonly();
  readonly gelToastDismissed = this._gelToastDismissed.asReadonly();

  readonly currentTrack = computed<TrackSlot | null>(() => this._tracks()[this._currentIndex()] ?? null);
  readonly isLastTrack = computed(() => this._currentIndex() === this._tracks().length - 1);
  readonly canShare = computed(() => this._results().length >= this._tracks().length);

  /** Série vue par le panneau : état neutre tant que le peek n'a pas répondu. */
  readonly sheetStreak = computed<StreakDto>(() => this._streakInfo() ?? emptyStreak());

  private readonly onRecap = computed(() => {
    const state = this._state();
    return state === 'done' || state === 'already_played';
  });

  /** Compte connecté : gel gagné par la partie du jour (« +1 gel gagné ! »). */
  readonly showGelEarnedToast = computed(() =>
    this.playerSession.isLinked() && this.onRecap() && !this._sessionAbandoned()
    && !this._gelToastDismissed() && this._todayStats()?.freezeMilestone === true);

  /** Compte connecté : gel(s) consommé(s) par la partie du jour (« 1 gel a sauvé ta série ! »). */
  readonly showGelUsedToast = computed(() =>
    this.playerSession.isLinked() && this.onRecap() && !this._sessionAbandoned()
    && !this._gelToastDismissed() && !this.showGelEarnedToast() && (this._todayStats()?.freezesUsed ?? 0) > 0);

  readonly freezesUsed = computed(() => this._todayStats()?.freezesUsed ?? 0);
  readonly freezesUsedKey = computed(() => pluralKey(this.freezesUsed()));

  /** Invité : palier de gel atteint (« Tu aurais gagné un gel ! ») — variante du toast de série. */
  readonly guestFreezeMiss = computed(() =>
    !this.playerSession.isLinked() && this._todayStats()?.freezeMilestone === true);

  // Série à afficher : depuis la session (welcome/playing/done) ou depuis les stats (already_played).
  private readonly displayStreak = computed(() => {
    const stats = this._todayStats();
    if (this._state() === 'already_played' && stats) return stats.currentStreak;
    return this._currentStreak();
  });

  // Série pour le toast (invité, done/already_played) : `currentStreak` reflète la valeur
  // AVANT la partie qui vient de se terminer (posée au démarrage) — sur l'écran `done`,
  // `todayStats` (chargé à l'entrée dans cet état) porte déjà la valeur à jour. La préférer
  // dès qu'elle est disponible, sinon retomber sur `displayStreak` (évite un flash à 0).
  readonly toastStreak = computed(() => this._todayStats()?.currentStreak ?? this.displayStreak());
  readonly toastStreakKey = computed(() => pluralKey(this.toastStreak()));

  readonly showStreakToast = computed(() =>
    !this.playerSession.isLinked() && !this._streakToastDismissed() && this.toastStreak() > 0 && this.onRecap());

  readonly showLostToast = computed(() =>
    !this.playerSession.isLinked() && this._state() === 'welcome' && this._lostStreak() !== null);

  readonly countdown = computed(() => {
    const s = this._secondsUntilMidnightUtc();
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.countdownInterval !== null) clearInterval(this.countdownInterval);
    });
  }

  // ── Transitions ──────────────────────────────────────────────────────────

  /** Premier chargement / bouton « Réessayer » des écrans d'erreur. */
  init(): void {
    this._state.set('loading');
    this.peek('initial');
  }

  /**
   * Retour au premier plan de l'onglet : relit l'état du jour sans rien créer. Pendant une
   * partie, détecte une complétion/un abandon fait dans un autre onglet.
   */
  refresh(): void {
    const state = this._state();
    if (state === 'welcome' || state === 'resume_prompt') this.peek('refocus');
    else if (state === 'playing') this.peek('playing');
  }

  /** Écran d'accueil → clic « Commencer à jouer » : c'est ICI qu'on crée la session (POST). */
  beginGame(): void {
    this._state.set('loading');
    this.loadSession();
  }

  /** Écran de reprise → clic « Reprendre » : POST (le back renvoie l'état de reprise). */
  beginResume(): void {
    this._state.set('loading');
    this.loadSession();
  }

  /**
   * Écran de reprise → clic « Abandonner » : il faut d'abord matérialiser la session
   * (POST, renvoie son id) avant de pouvoir l'abandonner.
   */
  beginAbandonFromResume(): void {
    this._abandonLoading.set(true);
    this.facade.startToday().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this._sessionId.set(res.sessionId);
        this.confirmAbandon();
      },
      error: () => this._abandonLoading.set(false),
    });
  }

  /** « Jouer maintenant » depuis le panneau de série : lance ou reprend la partie du jour. */
  playNow(): void {
    if (this._state() === 'welcome') this.beginGame();
    else if (this._state() === 'resume_prompt') this.beginResume();
  }

  requestAbandon(): void {
    this._showAbandonConfirm.set(true);
  }

  cancelAbandon(): void {
    this._showAbandonConfirm.set(false);
  }

  confirmAbandon(): void {
    this._abandonLoading.set(true);
    this.facade.abandonSession(this._sessionId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this._abandonLoading.set(false);
        this._showAbandonConfirm.set(false);
        this.enterAlreadyPlayed(true);
      },
      error: () => this._abandonLoading.set(false),
    });
  }

  /**
   * Envoie la réponse du morceau en cours et l'ajoute au récap en cas de succès. Le composant
   * s'abonne pour transmettre le résultat (ou l'échec) au round affiché. Sur échec définitif
   * (`GameService.submitAnswer` a déjà réessayé), rien n'est enregistré : pas de faux résultat
   * ni de passage au morceau suivant, sinon la partie ne se termine jamais côté serveur (piège 32).
   */
  submitAnswer(event: AnsweredEvent): Observable<SubmitAnswerResponse> {
    const index = this._currentIndex();
    const track = this._tracks()[index];
    return this.facade.submitAnswer(this._sessionId(), {
      dailyChallengeTrackId:   event.trackId,
      listenedDurationSeconds: event.listenedDurationSeconds,
      wasExtended:             event.wasExtended,
      artistAnswer:            event.artistAnswer ?? undefined,
      titleAnswer:             event.titleAnswer ?? undefined,
    }).pipe(tap(response => {
      this._totalScore.update(s => s + response.score);
      this._results.update(rs => [...rs, {
        artistCorrect:             response.artistCorrect,
        titleCorrect:              response.titleCorrect,
        score:                     response.score,
        correctArtist:             response.correctArtist,
        correctTitle:              response.correctTitle,
        listenedDurationSeconds:   response.listenedDurationSeconds,
        averageSecondsWhenCorrect: response.averageSecondsWhenCorrect,
        failureRatePercent:        response.failureRatePercent,
        position:                  index + 1,
        coverUrl:                  track?.coverUrl ?? null,
        deezerTrackId:             response.deezerTrackId,
      }]);
    }));
  }

  /** Morceau suivant, ou fin de partie après le dernier. */
  nextTrack(): void {
    const next = this._currentIndex() + 1;
    this._currentTrackMinListenedSeconds.set(null);
    if (next < this._tracks().length) {
      this._currentIndex.set(next);
      return;
    }
    this._state.set('done');
    this.resetRecapToasts();
    this._displayedTotalScore.set(0);
    countUp(this._totalScore(), v => this._displayedTotalScore.set(v), 1000);
    this.startCountdown();
    // Stats du jour → histogrammes par morceau dans le récap (popup au clic sur un score).
    this.loadTodayStats();
    // Série/gels après complétion (gel consommé ou gagné) pour la gélule du header.
    this.refreshStreakInfo();
  }

  dismissStreakToast(): void {
    this._streakToastDismissed.set(true);
  }

  dismissGelToast(): void {
    this._gelToastDismissed.set(true);
  }

  dismissLostToast(): void {
    this._lostStreak.set(null);
  }

  // ── Interne ──────────────────────────────────────────────────────────────

  private loadSession(): void {
    this.facade.loadSession().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(outcome => this.applyLoadOutcome(outcome));
  }

  private applyLoadOutcome(outcome: LoadOutcome): void {
    switch (outcome.kind) {
      case 'ok':
        this.applySession(outcome.response);
        break;
      case 'already_played':
        this.enterAlreadyPlayed(outcome.abandoned);
        break;
      case 'no_challenge':
        this._state.set('no_challenge');
        break;
      case 'error':
        this._state.set('error');
        break;
    }
  }

  private applySession(response: StartSessionResponse): void {
    this._sessionId.set(response.sessionId);
    this._tracks.set(response.tracks);
    this._currentStreak.set(response.currentStreak);
    const preload = this.audioPlayer.preloadAll(response.tracks.map(t => t.previewUrl));

    if (!response.isResuming) {
      this._currentIndex.set(0);
      this._totalScore.set(0);
      this._results.set([]);
      this._currentTrackMinListenedSeconds.set(null);
      // Le joueur a explicitement cliqué « Commencer à jouer » → on entre dans la partie.
      preload.then(() => this._state.set('playing'));
      return;
    }

    this._resumeCompletedAnswers.set(response.completedAnswers);
    this._currentIndex.set(response.resumeFromPosition);
    this._totalScore.set(response.completedAnswers.reduce((s, a) => s + a.score, 0));
    this._results.set([]);
    this._showAbandonConfirm.set(false);
    // Anti-cheat : si la session reprend sur un morceau déjà commencé, verrouiller le palier min.
    const resumeTrack = response.tracks[response.resumeFromPosition];
    this._currentTrackMinListenedSeconds.set(
      response.currentTrackId != null && resumeTrack?.id === response.currentTrackId && response.minListenedSeconds != null
        ? response.minListenedSeconds
        : null
    );
    // Le joueur a explicitement cliqué « Reprendre » → on enchaîne directement sur la partie
    // (reconstruction du récap incluse), pas de retour à l'écran de reprise.
    preload.then(() => this.resumePlaying());
  }

  /** Reconstitue le récap des morceaux déjà joués puis entre dans la partie. */
  private resumePlaying(): void {
    const completed = this._resumeCompletedAnswers();
    const tracks = this._tracks();
    this._currentIndex.set(Math.max(0, completed.length));
    this._totalScore.set(completed.reduce((s, a) => s + a.score, 0));
    this._results.set(completed.map((a, i) => ({
      artistCorrect:             a.artistCorrect,
      titleCorrect:              a.titleCorrect,
      score:                     a.score,
      correctArtist:             a.correctArtist ?? '',
      correctTitle:              a.correctTitle ?? '',
      listenedDurationSeconds:   a.listenedDurationSeconds,
      averageSecondsWhenCorrect: undefined,
      failureRatePercent:        0,
      position:                  a.position,
      coverUrl:                  tracks[i]?.coverUrl ?? null,
      deezerTrackId:             a.deezerTrackId ?? 0,
    })));
    this._state.set('playing');
  }

  /** Transition commune vers « déjà joué » (peek `already_played`/`abandoned`, POST 409, abandon confirmé). */
  private enterAlreadyPlayed(abandoned: boolean): void {
    this._sessionAbandoned.set(abandoned);
    this._state.set('already_played');
    this.resetRecapToasts();
    this.startCountdown();
    if (!abandoned) this.loadTodayStats();
  }

  /** Les toasts de fin de partie réapparaissent à chaque (ré)entrée dans un écran de récap. */
  private resetRecapToasts(): void {
    this._streakToastDismissed.set(false);
    this._gelToastDismissed.set(false);
  }

  private startCountdown(): void {
    if (this.countdownInterval !== null) return;
    const tick = () => {
      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      this._secondsUntilMidnightUtc.set(Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000)));
    };
    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  private refreshStreakInfo(): void {
    this.facade.peekSession().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(outcome => {
      if (outcome.kind === 'ok') this._streakInfo.set(outcome.response.streak ?? null);
    });
  }

  // Sans callback error, une ApiException (client NSwag) remontait comme un crash JS non géré
  // au lieu de laisser todayStats à null, déjà toléré par les écrans (piège 41).
  private loadTodayStats(): void {
    this.api.apiStatsToday().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: stats => this._todayStats.set(stats),
      error: () => {},
    });
  }

  /** Toast invité « série perdue » : une seule fois par série perdue (localStorage). */
  private checkLostStreak(streak: StreakDto | null): void {
    const key = dateKey(streak?.lastPlayedDate);
    if (streak?.lostStreak == null || key === null) return;
    try {
      if (localStorage.getItem(LOST_STREAK_SEEN_KEY) === key) return;
      localStorage.setItem(LOST_STREAK_SEEN_KEY, key);
    } catch {
      // Stockage indisponible (navigation privée…) : on affiche quand même, sans mémoriser.
    }
    this._lostStreak.set(streak.lostStreak);
  }

  /** Lecture seule (GET /api/sessions/today) : détermine l'écran à afficher SANS créer de session ni de cookie. */
  private peek(context: PeekContext): void {
    this.facade.peekSession().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(outcome => {
      if (outcome.kind === 'error') {
        if (context !== 'playing') this._state.set('error');
        return;
      }
      const res = outcome.response;
      this._currentStreak.set(res.currentStreak);
      this._streakInfo.set(res.streak ?? null);
      if (context === 'initial') this.checkLostStreak(res.streak ?? null);
      this._peekTracksCount.set(res.tracksCount);
      this._peekCompletedCount.set(res.completedCount);

      switch (res.state) {
        case 'can_start':
          if (context !== 'playing') this._state.set('welcome');
          break;
        case 'resumable':
          if (context !== 'playing') this._state.set('resume_prompt');
          break;
        case 'already_played':
          this.enterAlreadyPlayed(false);
          break;
        case 'abandoned':
          this.enterAlreadyPlayed(true);
          break;
        case 'no_challenge':
        default:
          if (context !== 'playing') this._state.set('no_challenge');
          break;
      }
    });
  }
}

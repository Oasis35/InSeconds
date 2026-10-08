import { computed, effect, inject, untracked } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { SessionLoader } from '../../account/data-access/session-loader';
import { SessionStore } from '../../core/session/session.store';
import { StoragePort } from '../../core/storage/storage.port';
import { RoundConfig, RoundSubmission } from '../../gameplay/domain/track-round';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { AnsweredTrack, DailySettings, DailyToday, DayStats, ResumedTrack, StartedSession, TrackSlot } from '../domain/daily';
import { DailyScreen, PeekContext, isRecapScreen, refocusContext, screenAfterToday } from '../domain/daily-screen';
import { formatCountdown, secondsUntilMidnightUtc } from '../domain/countdown';
import { toRoundResult } from '../domain/round-result';
import { EMPTY_STREAK, Streak, dateKey, pluralKey } from '../domain/streak';
import { recapToasts } from '../domain/toasts';
import { DailyApi } from './daily.api';

/** Toast invité « série perdue » : une seule fois par série perdue (clé = date du dernier défi joué). */
const LOST_STREAK_SEEN_KEY = 'inseconds.lostStreakNudgeSeen';

interface DailyState {
  screen: DailyScreen;
  today: DailyToday | null;
  settings: DailySettings | null;
  sessionId: number;
  tracks: readonly TrackSlot[];
  /** Les morceaux répondus de la partie (ceux de la reprise compris), dans l'ordre. */
  results: readonly AnsweredTrack[];
  /** Position du morceau en cours (1 pour le premier) ; 0 tant qu'aucune partie n'est lancée. */
  position: number;
  streak: Streak | null;
  /** La partie du jour a été abandonnée (écran « déjà joué »). */
  abandoned: boolean;
  abandonLoading: boolean;
  hintPending: boolean;
  lostStreak: number | null;
  streakToastDismissed: boolean;
  gelToastDismissed: boolean;
  stats: DayStats | null;
  secondsLeft: number;
}

const initialState: DailyState = {
  screen: 'loading',
  today: null,
  settings: null,
  sessionId: 0,
  tracks: [],
  results: [],
  position: 0,
  streak: null,
  abandoned: false,
  abandonLoading: false,
  hintPending: false,
  lostStreak: null,
  streakToastDismissed: false,
  gelToastDismissed: false,
  stats: null,
  secondsLeft: 0,
};

/**
 * La partie du jour (§ 6.2 du plan v2) : l'écran affiché (`DailyScreen`, les transitions sont dans `domain/daily-screen`), la partie en cours,
 * les morceaux répondus, la série, les statistiques du jour. À fournir à la page (avec `TrackRoundStore`, qu'il pilote) : la route fournit
 * aussi le lecteur (`provideGameplay()`).
 *
 * **Le son ne démarre que sur un clic du joueur** : `begin()` (« Commencer », « Reprendre ») et `nextTrack()` (« Piste suivante ») lancent la
 * manche ; jamais l'arrivée sur la route, un `effect` ni le retour de l'onglet au premier plan. Les navigateurs ne jouent un son qu'après un
 * geste, et Howler attend alors en silence, sans erreur.
 */
export const DailyGameStore = signalStore(
  withState<DailyState>(initialState),
  withComputed((store, session = inject(SessionStore)) => {
    const trackCount = computed(() => store.tracks().length);
    const totalScore = computed(() => store.results().reduce((sum, r) => sum + r.score, 0));
    const onRecap = computed(() => isRecapScreen(store.screen()));
    // La série annoncée à un invité : celle des statistiques du jour dès qu'elles sont là (la série de la partie date d'avant la dernière
    // réponse), sinon celle que l'on connaissait.
    const toastStreak = computed(() => store.stats()?.currentStreak ?? store.streak()?.streak ?? 0);
    return {
      trackCount,
      totalScore,
      linked: session.isLinked,
      currentIndex: computed(() => Math.max(0, store.position() - 1)),
      isLastTrack: computed(() => trackCount() > 0 && store.position() === trackCount()),
      canShare: computed(() => trackCount() > 0 && store.results().length >= trackCount()),
      peekTracksCount: computed(() => store.today()?.tracksCount ?? 0),
      peekCompletedCount: computed(() => store.today()?.completedCount ?? 0),
      /** Série vue par la gélule et le panneau : neutre tant que le serveur n'a pas répondu. */
      pillStreak: computed(() => store.streak()),
      sheetStreak: computed(() => store.streak() ?? EMPTY_STREAK),
      /** Ce que la carte de révélation montre du morceau en cours, une fois la réponse du serveur reçue. */
      roundResult: computed(() => {
        const answered = store.results().find(r => r.position === store.position());
        return answered ? toRoundResult(answered) : null;
      }),
      roundScore: computed(() => store.results().find(r => r.position === store.position())?.score ?? 0),
      roundDeezerTrackId: computed(() => store.results().find(r => r.position === store.position())?.deezerTrackId ?? null),
      countdown: computed(() => formatCountdown(store.secondsLeft())),
      toastStreak,
      toastStreakKey: computed(() => pluralKey(toastStreak())),
      toasts: computed(() =>
        recapToasts({
          linked: session.isLinked(),
          onRecap: onRecap(),
          abandoned: store.abandoned(),
          gelDismissed: store.gelToastDismissed(),
          streakDismissed: store.streakToastDismissed(),
          stats: store.stats(),
          toastStreak: toastStreak(),
        })),
      freezesUsed: computed(() => store.stats()?.freezesUsed ?? 0),
      freezesUsedKey: computed(() => pluralKey(store.stats()?.freezesUsed ?? 0)),
      showLostToast: computed(() => !session.isLinked() && store.screen() === 'welcome' && store.lostStreak() !== null),
    };
  }),
  withMethods((store, api = inject(DailyApi), round = inject(TrackRoundStore), sessionLoader = inject(SessionLoader), storage = inject(StoragePort)) => {
    let countdownTimer: ReturnType<typeof setInterval> | null = null;
    let statsRequest = 0;
    /** Les écoutes envoyées au serveur se suivent : une demande d'indice attend la dernière (sinon le serveur refuse, 409). */
    let listeningQueue: Promise<void> = Promise.resolve();
    const sentListening = new Map<number, number>();

    const stopCountdown = () => {
      if (countdownTimer !== null) clearInterval(countdownTimer);
      countdownTimer = null;
    };
    const startCountdown = () => {
      if (countdownTimer !== null) return;
      const tick = () => patchState(store, { secondsLeft: secondsUntilMidnightUtc(new Date()) });
      tick();
      countdownTimer = setInterval(tick, 1000);
    };

    const loadStats = async () => {
      const id = ++statsRequest;
      try {
        const stats = await api.stats();
        if (id === statsRequest) patchState(store, { stats });
      } catch {
        // Les chiffres du jour sont un plus : sans eux, l'égaliseur et les histogrammes manquent, le reste s'affiche (piège 41).
        if (id === statsRequest) patchState(store, { stats: null });
      }
    };

    const refreshStreak = async () => {
      try {
        const today = await api.today();
        patchState(store, { today, streak: today.streak });
      } catch {
        // la gélule garde la série qu'elle connaît
      }
    };

    /** La série perdue d'un invité s'annonce une seule fois (mémoire du navigateur). */
    const checkLostStreak = (streak: Streak) => {
      const key = dateKey(streak.lastPlayedDate);
      if (streak.lostStreak === null || key === null) return;
      if (storage.get(LOST_STREAK_SEEN_KEY) === key) return;
      storage.set(LOST_STREAK_SEEN_KEY, key);
      patchState(store, { lostStreak: streak.lostStreak });
    };

    const enterAlreadyPlayed = (abandoned: boolean) => {
      patchState(store, { screen: 'already_played', abandoned, streakToastDismissed: false, gelToastDismissed: false });
      startCountdown();
      if (!abandoned) void loadStats();
    };

    /** Redemande l'extrait d'un morceau à une adresse fraîche (la signature Deezer expire, piège 14) : la reprise de la partie en donne de neuves. */
    const refreshPreview = async (position: number): Promise<string | null> => {
      const outcome = await api.start();
      if (outcome.kind !== 'ok') return null;
      patchState(store, { tracks: outcome.session.tracks });
      return outcome.session.tracks.find(t => t.position === position)?.previewUrl || null;
    };

    const configOf = (position: number, settings: DailySettings, resumed: ResumedTrack | null): RoundConfig => ({
      trackId: position,
      previewUrl: store.tracks().find(t => t.position === position)?.previewUrl || null,
      listen: { steps: settings.allowedDurationsSeconds, extendable: true },
      hints: { unlockSeconds: settings.hints.map(h => h.unlockSeconds), kinds: settings.hints.map(h => h.kind) },
      // Reprise : le plancher d'écoute et les indices déjà payés du morceau en cours.
      listenedFloor: resumed && resumed.listenedSeconds > 0 ? resumed.listenedSeconds : null,
      hintLevel: resumed?.hintLevel ?? 0,
      hintFacts: resumed?.hintFacts ?? [],
      refreshPreviewUrl: () => refreshPreview(position),
    });

    /** Lance la manche d'un morceau. Appelé par un clic du joueur, jamais autrement. */
    const startTrack = (position: number, resumed: ResumedTrack | null) => {
      const settings = store.settings();
      if (!settings) return;
      sentListening.delete(position);
      const next = store.tracks().find(t => t.position === position + 1)?.previewUrl || null;
      patchState(store, { position, hintPending: false });
      round.start(configOf(position, settings, resumed), next);
    };

    const applySession = (session: StartedSession) => {
      patchState(store, {
        sessionId: session.sessionId,
        tracks: session.tracks,
        results: session.completedAnswers,
        streak: session.streak,
        screen: 'playing',
      });
      startTrack(session.nextPosition, session.currentTrack?.position === session.nextPosition ? session.currentTrack : null);
    };

    const peek = async (context: PeekContext) => {
      let today: DailyToday;
      try {
        today = await api.today();
      } catch {
        if (context !== 'playing') patchState(store, { screen: 'error' });
        return;
      }
      // Le joueur a bougé pendant la lecture (clic sur « Commencer ») : cette réponse ne dit plus rien de l'écran.
      if (context !== 'initial' && refocusContext(store.screen()) !== context) return;

      // Dernier morceau répondu : le serveur dit déjà « déjà joué », mais le joueur doit encore passer par le récap.
      const lastAnswered = store.tracks().length > 0 && store.results().length >= store.tracks().length;
      if (context === 'playing' && lastAnswered) {
        patchState(store, { today, streak: today.streak });
        return;
      }

      patchState(store, { today, streak: today.streak });
      if (context === 'initial') checkLostStreak(today.streak);
      const change = screenAfterToday(store.screen(), context, today.state);
      if (change.abandoned !== null) {
        // Partie finie ailleurs : la manche en cours (son compris) s'arrête.
        if (context === 'playing') resetRound();
        enterAlreadyPlayed(change.abandoned);
      }
      else patchState(store, { screen: change.screen });
    };

    const ensureSettings = async (): Promise<DailySettings | null> => {
      const known = store.settings();
      if (known) return known;
      try {
        const settings = await api.settings();
        patchState(store, { settings });
        return settings;
      } catch {
        return null;
      }
    };

    /** Envoie l'écoute au serveur : il débloque les indices et fixe le plancher anti-triche d'après ce palier (piège 35). */
    const reportListening = (position: number, seconds: number) => {
      const sessionId = store.sessionId();
      sentListening.set(position, seconds);
      listeningQueue = listeningQueue
        .then(() => api.updateListening(sessionId, position, seconds))
        .catch(() => {
          // Pas partie : on la renverra au prochain changement de palier.
          if (sentListening.get(position) === seconds) sentListening.delete(position);
        });
    };

    const resetRound = () => round.reset();

    /** Premier chargement, ou « Réessayer » d'un écran d'erreur. */
    const init = (): Promise<void> => {
      patchState(store, { screen: 'loading' });
      return peek('initial');
    };

    /** « Commencer à jouer » et « Reprendre » : crée (ou reprend) la partie, puis lance le premier morceau. */
    const begin = async (): Promise<void> => {
      // Dans le clic, avant les appels réseau : sinon, sur iPhone, le premier morceau resterait muet jusqu'au geste suivant.
      round.unlockAudio();
      patchState(store, { screen: 'loading' });
      await sessionLoader.ensureGuest();
      const settings = await ensureSettings();
      if (!settings) {
        patchState(store, { screen: 'error' });
        return;
      }
      const outcome = await api.start();
      switch (outcome.kind) {
        case 'ok':
          applySession(outcome.session);
          break;
        case 'already_played':
          enterAlreadyPlayed(outcome.abandoned);
          break;
        case 'no_challenge':
          patchState(store, { screen: 'no_challenge' });
          break;
        default:
          patchState(store, { screen: 'error' });
      }
    };

    /** Abandonne la partie en cours. */
    const abandon = async (): Promise<void> => {
      patchState(store, { abandonLoading: true });
      try {
        await api.abandon(store.sessionId());
        resetRound();
        enterAlreadyPlayed(true);
      } catch {
        // la partie reste en cours : le joueur peut réessayer
      } finally {
        patchState(store, { abandonLoading: false });
      }
    };

    return {
      init,

      /** Retour de l'onglet au premier plan : relit l'état du jour sans rien créer (une partie finie ailleurs se voit). */
      refresh(): void {
        const context = refocusContext(store.screen());
        if (context) void peek(context);
      },

      begin,
      abandon,

      /**
       * « Réessayer » sur l'écran « pas de défi ». La lecture de l'état du jour ne génère rien (§ 5.6 du plan v2) : si le défi manque encore, c'est
       * le démarrage d'une partie qui le génère à la volée (secours de la tâche de minuit). Le joueur arrive donc directement dans la partie ;
       * un pool insuffisant ramène ici.
       */
      async retryNoChallenge(): Promise<void> {
        round.unlockAudio();
        await init();
        if (store.screen() === 'no_challenge') await begin();
      },

      /** « Jouer maintenant » du panneau de série : lance ou reprend la partie du jour. */
      playNow(): void {
        const screen = store.screen();
        if (screen === 'welcome' || screen === 'resume_prompt') void begin();
      },

      /** Écran de reprise → « Abandonner » : la partie existe côté serveur, on retrouve son identifiant puis on l'abandonne. */
      async abandonFromResume(): Promise<void> {
        patchState(store, { abandonLoading: true });
        const outcome = await api.start();
        if (outcome.kind === 'ok') {
          patchState(store, { sessionId: outcome.session.sessionId });
          await abandon();
        } else {
          patchState(store, { abandonLoading: false });
        }
      },

      /**
       * La manche rend la réponse à envoyer : le serveur la corrige, puis la manche la révèle. Sur un échec définitif (l'adaptateur a déjà
       * réessayé), rien n'est enregistré et le joueur reste sur le morceau avec « Réessayer » (piège 32).
       */
      async submit(submission: RoundSubmission): Promise<void> {
        try {
          const answered = await api.submitAnswer(store.sessionId(), {
            position: submission.trackId,
            listenedSeconds: submission.listenedSeconds,
            wasExtended: submission.wasExtended,
            artist: submission.artist,
            title: submission.title,
          });
          patchState(store, { results: [...store.results().filter(r => r.position !== answered.position), answered] });
          round.reveal();
        } catch {
          round.submissionFailed();
        }
      },

      /** Un indice : le serveur le donne (et le facture), la manche l'affiche. */
      async requestHint(level: number): Promise<void> {
        const position = store.position();
        patchState(store, { hintPending: true });
        try {
          await listeningQueue;
          const facts = await api.requestHint(store.sessionId(), position, level);
          round.applyHints(level, facts);
        } catch {
          // l'indice n'est pas révélé : le joueur peut le redemander
        } finally {
          patchState(store, { hintPending: false });
        }
      },

      /** « Piste suivante » (un clic) : le morceau suivant, ou la fin de partie après le dernier. */
      nextTrack(): void {
        round.unlockAudio();
        if (!store.isLastTrack()) {
          startTrack(store.position() + 1, null);
          return;
        }
        resetRound();
        patchState(store, { screen: 'done', streakToastDismissed: false, gelToastDismissed: false });
        startCountdown();
        void loadStats();
        void refreshStreak();
      },

      /** Suit le palier choisi de la manche (appelé par le hook ci-dessous, jamais par un composant). */
      syncListening(position: number, seconds: number): void {
        if (store.screen() !== 'playing' || store.sessionId() === 0 || position < 1 || seconds <= (sentListening.get(position) ?? 0)) return;
        reportListening(position, seconds);
      },

      dismissStreakToast: () => patchState(store, { streakToastDismissed: true }),
      dismissGelToast: () => patchState(store, { gelToastDismissed: true }),
      dismissLostToast: () => patchState(store, { lostStreak: null }),

      /** Libère la minuterie du compte à rebours. */
      stopCountdown,
    };
  }),
  withHooks({
    onInit(store) {
      const round = inject(TrackRoundStore);
      // Chaque palier choisi part au serveur ; l'effet ne fait que suivre la manche, il ne lance jamais de son.
      effect(() => {
        const position = round.trackId();
        const seconds = round.chosenSeconds();
        untracked(() => {
          if (position !== null) store.syncListening(position, seconds);
        });
      });
    },
    onDestroy(store) {
      store.stopCountdown();
    },
  }),
);

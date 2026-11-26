import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { SessionStore } from '../../core/session/session.store';
import { AnsweredTrack, DailySettings, DailyToday, DayStats } from '../domain/daily';
import { DailyScreen, PeekContext, isRecapScreen, refocusContext, screenAfterToday } from '../domain/daily-screen';
import { formatCountdown, secondsUntilMidnightUtc, todayUtc } from '../../core/game-day/game-day';
import { EMPTY_STREAK, Streak, pluralKey } from '../domain/streak';
import { maxDayScore, scoreVerdict } from '../domain/verdict';
import { GuestTileDismissal, guestTile, recapToasts } from '../domain/toasts';
import { DailyApi } from './daily.api';

interface HomeState {
  screen: DailyScreen;
  today: DailyToday | null;
  /**
   * L'état du jour lu ne dit plus la vérité : une partie a été lancée depuis (la manche, sur `/daily`) et n'est pas finie. L'accueil
   * relit alors l'état du jour en y revenant (carte de reprise après une sortie en cours de partie).
   */
  stale: boolean;
  /** Les morceaux répondus de la partie qui vient de finir (le résultat de l'accueil), dans l'ordre. */
  results: readonly AnsweredTrack[];
  /** Le nombre de morceaux du défi de la partie qui vient de finir. */
  finishedTrackCount: number;
  streak: Streak | null;
  /** La partie du jour a été abandonnée (écran « déjà joué »). */
  abandoned: boolean;
  abandonLoading: boolean;
  lostStreak: number | null;
  /** Invité : la série affichée quand il a fermé le bandeau « crée un compte » (la page la relit du navigateur, `GuestStreakNotice`). */
  guestTileDismissal: GuestTileDismissal | null;
  stats: DayStats | null;
  /** Les réglages du jeu, lus avec le résultat pour le maximum du défi (« / 5 000 ») ; `null` tant qu'ils manquent ou en cas d'échec (rien n'est alors affiché). */
  settings: DailySettings | null;
  secondsLeft: number;
}

const initialState: HomeState = {
  screen: 'loading',
  today: null,
  stale: false,
  results: [],
  finishedTrackCount: 0,
  streak: null,
  abandoned: false,
  abandonLoading: false,
  lostStreak: null,
  guestTileDismissal: null,
  stats: null,
  settings: null,
  secondsLeft: 0,
};

/**
 * L'état du jour de l'accueil (`/`) : l'écran affiché (`DailyScreen`, les transitions sont dans `domain/daily-screen`), la série, les statistiques
 * du jour, le résultat de la partie qui vient de finir, la tuile « crée un compte » d'un invité. **Il ne connaît ni la manche ni le lecteur** :
 * la partie se joue sur `/daily` (`DailyRoundStore`, chargé à la demande), qui lui rend sa fin (`finishGame`, `enterAlreadyPlayed`, `fail`).
 * Fourni par `DailyShellComponent`, il vit tant qu'on passe de l'accueil à la manche et revient.
 *
 * **Le son ne démarre que sur un clic** : le clic sur « Commencer » (ou « Reprendre ») déverrouille l'élément audio (`DailyLauncher`)
 * avant d'ouvrir la manche ; jamais l'arrivée sur la route, un `effect` ni le retour de l'onglet.
 */
export const HomeStore = signalStore(
  withState<HomeState>(initialState),
  withComputed((store, session = inject(SessionStore)) => {
    const onRecap = computed(() => isRecapScreen(store.screen()));
    const totalScore = computed(() => store.results().reduce((sum, r) => sum + r.score, 0));
    // La série annoncée à un invité : celle des statistiques du jour dès qu'elles sont là (la série de la partie date d'avant la dernière
    // réponse), sinon celle que l'on connaissait.
    const toastStreak = computed(() => store.stats()?.currentStreak ?? store.streak()?.streak ?? 0);
    // Les parties terminées du joueur, celle du jour comprise : juste après la dernière réponse, l'état du jour relu avant la partie ne la
    // compte pas encore (il la compte dès qu'il dit « déjà joué »).
    const gamesPlayed = computed(() => {
      const today = store.today();
      if (!today) return null;
      return today.completedGames + (store.screen() === 'done' && today.state !== 'already_played' ? 1 : 0);
    });
    const maxScore = computed(() => maxDayScore(store.today()?.tracksCount, store.settings()?.durationScores));
    return {
      totalScore,
      /** Le maximum du défi du jour (morceaux × meilleur palier), pour « / 5 000 » ; `null` tant que les réglages ou l'état du jour manquent. */
      maxScore,
      /** Le mot du résultat, sur le score final (jamais celui qui monte) ; `null` sans maximum connu. */
      dayVerdict: computed(() => scoreVerdict(store.stats()?.yourScore ?? totalScore(), maxScore())),
      linked: session.isLinked,
      canShare: computed(() => store.finishedTrackCount() > 0 && store.results().length >= store.finishedTrackCount()),
      peekTracksCount: computed(() => store.today()?.tracksCount ?? 0),
      peekCompletedCount: computed(() => store.today()?.completedCount ?? 0),
      /** Le chiffre de l'accueil : le record du joueur, sinon la médiane d'hier (le serveur ne rend la médiane qu'à un joueur sans record). */
      bestScore: computed(() => store.today()?.bestScore ?? null),
      yesterdayMedian: computed(() => store.today()?.yesterdayMedian ?? null),
      /** Série vue par la gélule et le panneau : neutre tant que le serveur n'a pas répondu. */
      pillStreak: computed(() => store.streak()),
      sheetStreak: computed(() => store.streak() ?? EMPTY_STREAK),
      /** Parties terminées du joueur, pour le panneau de série d'un compte : relues avec la série (`GET /api/daily/today`), vides avant. */
      sheetGamesPlayed: computed(() => store.today()?.completedGames ?? null),
      /** Le joueur n'a fini aucune partie : l'accueil lui donne la règle en une phrase. Faux tant que l'état du jour n'est pas lu. */
      firstGame: computed(() => store.today()?.completedGames === 0),
      countdown: computed(() => formatCountdown(store.secondsLeft())),
      /** Les parties terminées du joueur, celle du jour comprise (voir plus haut) ; `null` tant que l'état du jour n'est pas lu. */
      gamesPlayed,
      toastStreak,
      toastStreakKey: computed(() => pluralKey(toastStreak())),
      toasts: computed(() =>
        recapToasts({ linked: session.isLinked(), onRecap: onRecap(), abandoned: store.abandoned(), stats: store.stats() })),
      /** La tuile « crée un compte » d'un invité, sous la carte du défi ; `null` pour un compte et quand rien n'est dû. */
      guestTile: computed(() =>
        guestTile({
          linked: session.isLinked(),
          onWelcome: store.screen() === 'welcome',
          onRecap: onRecap(),
          lostStreak: store.lostStreak(),
          gamesPlayed: gamesPlayed(),
          stats: store.stats(),
          toastStreak: toastStreak(),
          dismissal: store.guestTileDismissal(),
          today: todayUtc(new Date()),
        })),
      freezesUsed: computed(() => store.stats()?.freezesUsed ?? 0),
      freezesUsedKey: computed(() => pluralKey(store.stats()?.freezesUsed ?? 0)),
    };
  }),
  withMethods((store, api = inject(DailyApi)) => {
    let countdownTimer: ReturnType<typeof setInterval> | null = null;
    let statsRequest = 0;

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

    /** Les réglages servent au maximum du défi : un échec les laisse vides, le résultat s'affiche sans verdict. */
    const loadSettings = async () => {
      if (store.settings()) return;
      try {
        patchState(store, { settings: await api.settings() });
      } catch {
        // pas de verdict sans réglages
      }
    };

    const loadStats = async () => {
      void loadSettings();
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

    const enterAlreadyPlayed = (abandoned: boolean) => {
      patchState(store, { screen: 'already_played', abandoned, stale: false });
      startCountdown();
      // Une partie abandonnée relit aussi les stats, pour son score partiel et ses réponses (rien sans réponse).
      void loadStats();
    };

    const peek = async (context: PeekContext) => {
      let today: DailyToday;
      try {
        today = await api.today();
      } catch {
        patchState(store, { screen: 'error' });
        return;
      }
      // Le joueur a bougé pendant la lecture (clic sur « Commencer ») : cette réponse ne dit plus rien de l'écran.
      if (context !== 'initial' && refocusContext(store.screen()) !== context) return;

      patchState(store, { today, streak: today.streak, stale: false });
      const change = screenAfterToday(today.state);
      if (change.abandoned !== null) enterAlreadyPlayed(change.abandoned);
      else patchState(store, { screen: change.screen });
    };

    /** Premier chargement, ou « Réessayer » d'un écran d'erreur. */
    const init = (): Promise<void> => {
      // Au retour d'une manche (état périmé), pas d'écran de chargement : l'accueil passe directement à la tuile de reprise.
      if (!store.stale()) patchState(store, { screen: 'loading' });
      return peek('initial');
    };

    /**
     * Abandonne la partie en pause : la partie existe côté serveur, on retrouve son identifiant par la reprise (`POST …/sessions`, la seule
     * route qui le rend ; elle redonne aussi des adresses d'extrait que l'accueil ignore) puis on l'abandonne.
     */
    const abandonFromResume = async (): Promise<void> => {
      patchState(store, { abandonLoading: true });
      const outcome = await api.start();
      if (outcome.kind === 'ok') {
        try {
          await api.abandon(outcome.session.sessionId);
          enterAlreadyPlayed(true);
        } catch {
          // la partie reste en pause : le joueur peut réessayer
        } finally {
          patchState(store, { abandonLoading: false });
        }
        return;
      }
      patchState(store, { abandonLoading: false });
      // Partie finie ou abandonnée dans un autre onglet entre-temps : on montre « déjà joué ».
      if (outcome.kind === 'already_played') enterAlreadyPlayed(outcome.abandoned);
    };

    return {
      init,
      abandonFromResume,

      /** Retour de l'onglet au premier plan sur l'accueil : relit l'état du jour sans rien créer (une partie finie ailleurs se voit). */
      refresh(): void {
        const context = refocusContext(store.screen());
        if (context) void peek(context);
      },

      /**
       * Une partie vient d'être lancée sur `/daily` : l'état du jour lu (« à jouer ») ne dit plus la vérité, l'accueil le relira en y revenant
       * (sans effet une fois la partie finie, `finishGame`, ou abandonnée). `streak` : la série donnée par le serveur au démarrage.
       */
      roundStarted: (streak: Streak) => patchState(store, { stale: true, streak }),
      /** La partie est finie ailleurs, ou abandonnée ici : l'écran « déjà joué ». */
      enterAlreadyPlayed,
      /** Le démarrage a échoué : l'accueil dit pourquoi (`no_challenge` : pool insuffisant, `error`). */
      fail: (screen: 'no_challenge' | 'error') => patchState(store, { screen, stale: false }),

      /** La dernière réponse est rendue : le résultat de la partie, sur l'accueil, avec les statistiques du jour et la série relues. */
      finishGame(results: readonly AnsweredTrack[], trackCount: number): void {
        patchState(store, { screen: 'done', results, finishedTrackCount: trackCount, stale: false });
        startCountdown();
        void loadStats();
        void refreshStreak();
      },

      /** Ferme la tuile « crée un compte » d'un invité et rend la fermeture à mémoriser (la page la garde dans le navigateur). */
      dismissGuestTile(): GuestTileDismissal {
        const dismissal = { day: todayUtc(new Date()), streak: store.toastStreak() };
        patchState(store, { guestTileDismissal: dismissal });
        return dismissal;
      },
      /** La fermeture de la tuile « crée un compte » relue du navigateur par la page. */
      restoreGuestTileDismissal: (guestTileDismissal: GuestTileDismissal | null) => patchState(store, { guestTileDismissal }),
      /** La série perdue d'un invité, dite par la tuile ; la page décide si elle est due (une seule fois par série perdue, `LostStreakNotice`). */
      announceLostStreak: (lostStreak: number) => patchState(store, { lostStreak }),

      /** Mémorise l'état du jour lu par la manche (retour de l'onglet : la partie a changé ailleurs). */
      setToday: (today: DailyToday) => patchState(store, { today, streak: today.streak }),

      /** Libère la minuterie du compte à rebours. */
      stopCountdown,
    };
  }),
  withHooks({
    onDestroy(store) {
      store.stopCountdown();
    },
  }),
);

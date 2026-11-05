import { DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { SessionLoader } from '../../account/data-access/session-loader';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RoundConfig, RoundSubmission } from '../../gameplay/domain/track-round';
import { waveformFromBlob } from '../../gameplay/domain/waveform';
import {
  AUTO_NEXT_MS, CLOCK_ALERT_SECONDS, PileEntry, RunComparison, RunCurrentTrack, RunDifficulty, RunLink, RunPlay, RunRound, RunSession, RunStep, RunsMe,
  isFinished,
  nextObjective, palierDue, playSteps, playedCount, runPile, stepPosition,
} from '../domain/run';
import { RunCardKey, handFull } from '../domain/run-cards';
import { RunTick } from './run-tick';
import { RunsApi, StartOutcome } from './runs.api';

/** Le pas du chrono affiché. */
const CLOCK_TICK_MS = 200;

/**
 * L'écran affiché : le chargement, l'accueil du mode (lancer), le lien reçu d'un ami, la reprise d'une partie en cours, la partie (la carte du
 * morceau, sa réponse ou le morceau retiré, et la pile du run), la fin, la comparaison des joueurs d'une playlist, et les refus (pas d'accès sur
 * invitation, que la page traduit en retour au jeu du jour ; pas de playlist ; playlist inconnue ; erreur).
 */
export type RunScreen =
  | 'loading' | 'welcome' | 'link' | 'resume' | 'playing' | 'palier' | 'difficulty' | 'finished' | 'comparison' | 'access_denied' | 'no_challenge'
  | 'not_found' | 'error';

interface RunState {
  screen: RunScreen;
  /** La playlist du lien ouvert (`/runs/<code>`) ; `null` sur `/runs`. */
  code: string | null;
  link: RunLink | null;
  comparison: RunComparison | null;
  me: RunsMe | null;
  session: RunSession | null;
  /** Le morceau à jouer (ou, tant que des étapes restent à montrer, celui que le dernier clic lancera). */
  current: RunCurrentTrack | null;
  /**
   * Ce qu'il reste à montrer avant de jouer `current` : la réponse au morceau, un morceau retiré. La première est à l'écran ; chaque clic (ou
   * l'enchaînement automatique) passe à la suivante (cf. `playSteps`).
   */
  steps: readonly RunStep[];
  /** La forme de chaque morceau joué (une valeur de 0 à 1 par barre), par position : la pile la dessine. */
  shapes: Readonly<Record<number, readonly number[]>>;
  /** Ce qu'il reste au chrono du morceau en cours, en secondes ; `null` tant qu'il n'est pas parti. */
  clockLeft: number | null;
  /** Le chrono du morceau en cours est à zéro : la manche envoie ce qui est tapé. */
  timeUp: boolean;
  /** L'étape à l'écran passera seule à la suivante (la barre de « Morceau suivant » se remplit). */
  autoNext: boolean;
  /** La partie s'enchaîne seule après une réponse ; la page le coupe en mouvement réduit (et dans les tests de bout en bout). */
  autoAdvance: boolean;
  /** La partie en cours que l'écran de reprise propose : combien de morceaux sont déjà joués, sur combien. */
  resumeCount: number;
  resumeTotal: number;
  abandonLoading: boolean;
  /** La manche dont le joueur a quitté l'écran de palier par « Suite » (il ne revient pas). */
  palierDismissedFor: number | null;
  /** La carte de l'offre en attente d'échange (main pleine : le joueur touche ensuite la carte à lâcher). */
  pendingCard: RunCardKey | null;
  /** Une prise ou un passage de l'offre part au serveur. */
  palierBusy: boolean;
  /** Le choix de la difficulté part au serveur. */
  difficultyBusy: boolean;
  /** Une carte jouée part au serveur. */
  cardBusy: boolean;
}

const initialState: RunState = {
  screen: 'loading',
  code: null,
  link: null,
  comparison: null,
  me: null,
  session: null,
  current: null,
  steps: [],
  shapes: {},
  clockLeft: null,
  timeUp: false,
  autoNext: false,
  autoAdvance: true,
  resumeCount: 0,
  resumeTotal: 0,
  abandonLoading: false,
  palierDismissedFor: null,
  pendingCard: null,
  palierBusy: false,
  difficultyBusy: false,
  cardBusy: false,
};

/**
 * La partie de Run : l'écran, la partie en cours, le morceau à jouer, les étapes à montrer. À fournir à la page (avec `TrackRoundStore`, qu'il
 * pilote) ; la route fournit l'adaptateur de l'API et le lecteur (`provideGameplay()`). Le serveur décide de tout (points, jauge, neutralisation,
 * fin) : le store affiche ce qu'il rend.
 *
 * **Le premier son part d'un clic du joueur** : `begin()`, `playLink()` et `playAgain()` lancent la manche, jamais l'arrivée sur la route ni une
 * réponse du serveur. Ils commencent par `round.unlockAudio()`, **avant tout `await`** (iPhone : un son lancé hors du geste reste muet) ; ensuite,
 * le morceau suivant s'enchaîne seul 2 s après la réponse (le lecteur est déjà déverrouillé), ou au clic sur « Morceau suivant ». En mouvement
 * réduit (et dans les tests de bout en bout), la page coupe l'enchaînement (`setAutoAdvance`) : rien ne part seul.
 *
 * **Le chrono d'un morceau** (`answerSeconds`, 45 s) part au premier son : le store l'annonce au serveur (`startClock`), qui fait foi ; à la
 * reprise, il repart de ce que le serveur dit qu'il reste. À zéro, la manche envoie ce qui est tapé (`timeUp`). Les dernières secondes font un
 * tic quand aucun extrait ne joue.
 */
export const RunGameStore = signalStore(
  withState<RunState>(initialState),
  withComputed(store => {
    const step = computed<RunStep | null>(() => store.steps()[0] ?? null);
    const clockLeft = store.clockLeft;
    return {
      rounds: computed(() => store.session()?.rounds ?? 0),
      step,
      totalScore: computed(() => store.session()?.totalScore ?? 0),
      /** La manche telle que l'écran la montre : celle de l'étape à l'écran, sinon celle du morceau en cours. */
      shownRound: computed<RunRound | null>(() => step()?.round ?? store.session()?.round ?? null),
      /** Le morceau auquel le joueur vient de répondre : sa réponse est dans la carte tant que l'étape est à l'écran. */
      revealed: computed(() => { const shown = step(); return shown?.kind === 'revealed' ? shown.track : null; }),
      /** Le morceau retiré de la manche à l'écran (carte « Morceau retiré »). */
      withdrawn: computed(() => { const shown = step(); return shown?.kind === 'neutralized' ? shown : null; }),
      /** Le prochain clic mène à la fin de la partie (manche ratée, ou dernière manche) : le bouton l'annonce. */
      nextEndsRun: computed(() => store.steps().length === 1 && store.session() !== null && isFinished(store.session()!)),
      /** La pile du run : ce qui est à l'écran dans la carte (et ce qui suit) n'y est pas encore. */
      pile: computed<PileEntry[]>(() => {
        const session = store.session();
        if (!session) return [];
        const shown = step();
        const hide = shown ? { position: stepPosition(shown), round: shown.round.round } : null;
        return runPile(session.playedTracks, session.passedRounds, hide);
      }),
      /** Le temps affiché par le chrono : ce qui reste, sinon le chrono plein tant qu'il n'est pas parti ; `null` sans chrono. */
      clockShown: computed<number | null>(() => {
        const seconds = store.session()?.answerSeconds ?? 0;
        if (seconds <= 0) return null;
        return clockLeft() ?? seconds;
      }),
      /** Les dernières secondes du chrono : gros chiffre, bord de la carte éclairci. */
      clockAlert: computed(() => { const left = clockLeft(); return left !== null && left > 0 && left <= CLOCK_ALERT_SECONDS; }),
      record: computed(() => store.me()?.record ?? null),
      /** « Nouvelle partie » : seulement avec l'accès (retiré en cours de partie, la partie se finit, mais pas d'autre). */
      canPlayAgain: computed(() => store.me()?.hasAccess === true),
      finish: computed(() => store.session()?.finish ?? null),
      /** Les cartes jouables sur le morceau en cours (la main) et ce que celles déjà jouées révèlent ; rien sans coups de pouce. */
      roundCards: computed(() => {
        const session = store.session();
        const current = store.current();
        if (!session || session.handSize <= 0 || !current || store.steps().length > 0) return null;
        return { hand: session.hand, effects: current.effects ?? null };
      }),
      /** Ce que montre l'écran « Difficulté ? » : la manche, le score du run, les difficultés proposées, la main. */
      difficulty: computed(() => {
        const session = store.session();
        const choice = session?.difficultyChoice;
        if (store.screen() !== 'difficulty' || !session?.round || !choice) return null;
        return {
          round: choice.round,
          totalScore: session.totalScore,
          options: choice.options,
          hand: session.hand,
          listenSeconds: session.listenSeconds,
          headerRound: { round: session.round.round, score: 0, objective: session.round.objective, maxScore: session.round.maxScore },
        };
      }),
      /** Ce que montre l'écran de palier : la manche passée, la suivante et son objectif, l'offre, la main. */
      palier: computed(() => {
        const session = store.session();
        const passed = session?.passedRounds.at(-1);
        if (store.screen() !== 'palier' || !session?.round || !passed) return null;
        return {
          passed,
          nextRound: session.round.round,
          nextObjective: nextObjective(session),
          nextDisc: session.nextDisc?.key ?? null,
          wonDiscs: session.passedRounds.map(p => p.disc.key),
          offer: session.offer,
          hand: session.hand,
          handSize: session.handSize,
          /** L'en-tête : la barre du run sur la manche à venir, pas encore commencée. */
          headerRound: { round: session.round.round, score: 0, objective: session.round.objective, maxScore: session.round.maxScore },
        };
      }),
    };
  }),
  withMethods((store, api = inject(RunsApi), round = inject(TrackRoundStore), sessionLoader = inject(SessionLoader), tick = inject(RunTick)) => {
    /** L'enchaînement automatique en attente. */
    let autoNextTimer: ReturnType<typeof setTimeout> | null = null;
    /** Le chrono en cours : son échéance (horloge du navigateur, en ms), son pas, et le morceau qu'il chronomètre. */
    let clockDeadline = 0;
    let clockTimer: ReturnType<typeof setInterval> | null = null;
    let clockPosition: number | null = null;
    /** Le dernier morceau dont le premier son a été annoncé au serveur. */
    let announced: number | null = null;

    const cancelAutoNext = (): void => {
      if (autoNextTimer !== null) clearTimeout(autoNextTimer);
      autoNextTimer = null;
      if (store.autoNext()) patchState(store, { autoNext: false });
    };

    /** L'étape à l'écran passera seule à la suivante dans 2 s (sauf enchaînement coupé : le joueur clique). */
    const armAutoNext = (): void => {
      cancelAutoNext();
      if (!store.autoAdvance()) return;
      patchState(store, { autoNext: true });
      autoNextTimer = setTimeout(() => {
        autoNextTimer = null;
        advance();
      }, AUTO_NEXT_MS);
    };

    const stopClock = (): void => {
      if (clockTimer !== null) clearInterval(clockTimer);
      clockTimer = null;
      clockPosition = null;
      patchState(store, { clockLeft: null, timeUp: false });
    };

    /** Fait tourner le chrono du morceau `position` à partir de `seconds` ; une seule fois par morceau. */
    const runClock = (position: number, seconds: number): void => {
      if (clockPosition === position) return;
      stopClock();
      clockPosition = position;
      clockDeadline = Date.now() + seconds * 1000;
      let lastWhole = Math.ceil(seconds);
      const update = (): void => {
        const left = Math.max(0, (clockDeadline - Date.now()) / 1000);
        const whole = Math.ceil(left);
        // Un tic à chaque seconde des dernières, quand aucun extrait ne joue (il couvrirait le morceau).
        if (whole !== lastWhole && whole > 0 && whole <= CLOCK_ALERT_SECONDS && round.phase() !== 'playing') tick.play();
        lastWhole = whole;
        patchState(store, { clockLeft: left });
        if (left <= 0) {
          if (clockTimer !== null) clearInterval(clockTimer);
          clockTimer = null;
          patchState(store, { timeUp: true });
        }
      };
      patchState(store, { clockLeft: seconds, timeUp: seconds <= 0 });
      if (seconds > 0) clockTimer = setInterval(update, CLOCK_TICK_MS);
    };

    /**
     * Recale le chrono qui tourne sur ce que le serveur a retenu, quand il lui reste moins de temps (le serveur ne laisse pas un joueur resté
     * longtemps sur la réponse d'avant repartir avec un chrono plein) ; jamais pour en ajouter.
     */
    const alignClock = (position: number, seconds: number): void => {
      if (clockPosition !== position || clockTimer === null) return;
      const deadline = Date.now() + seconds * 1000;
      if (deadline < clockDeadline) clockDeadline = deadline;
    };

    /** Redemande l'extrait d'un morceau à une adresse fraîche (la signature Deezer expire, piège 14). */
    const refreshPreview = async (position: number): Promise<string | null> => {
      const sessionId = store.session()?.sessionId;
      if (sessionId === undefined) throw new Error('runs.refresh_preview: no session');
      const play = await api.refreshPreview(sessionId);
      if (play.current?.position === position) return play.current.previewUrl;
      // Le serveur a retiré ce morceau (extrait introuvable) ou la partie est finie : l'écran montre le retrait (puis le bilan s'il finit la
      // manche), sans relancer de son hors d'un clic. La manche du morceau disparu est oubliée : son adresse ne sert plus.
      applyPlay(play, false);
      throw new Error('runs.refresh_preview: track neutralized');
    };

    const configOf = (current: RunCurrentTrack, listenSeconds: number): RoundConfig => ({
      trackId: current.position,
      previewUrl: current.previewUrl,
      waveform: current.waveform ?? null,
      // Écoute fixe : un seul palier, pas de « écouter plus » ; la relecture (↺) reste possible. Pas d'indice.
      listen: { steps: [current.listenSeconds ?? listenSeconds], extendable: false },
      hints: { unlockSeconds: [] },
      refreshPreviewUrl: () => refreshPreview(current.position),
    });

    const refreshMe = async (): Promise<void> => {
      try {
        patchState(store, { me: await api.me() });
      } catch {
        // l'accueil se contente de ce qu'il sait
      }
    };

    /**
     * Montre la première étape qui reste ; sans étape, la fin de la partie ou le morceau à jouer. `play` : le morceau démarre (seulement dans
     * le clic du joueur ; une redemande d'extrait rend toujours une étape à montrer quand le morceau change).
     */
    const show = (play: boolean): void => {
      const session = store.session();
      if (!session) return;
      const [step] = store.steps();
      if (step) {
        round.reset();
        stopClock();
        patchState(store, { screen: 'playing' });
        armAutoNext();
        return;
      }
      // Une manche passée (playlist à coups de pouce) : l'écran de palier, jusqu'à « Suite ».
      if (palierDue(session, store.palierDismissedFor())) {
        round.reset();
        stopClock();
        patchState(store, { screen: 'palier', pendingCard: null });
        return;
      }
      const current = store.current();
      // La manche attend sa difficulté : son premier morceau n'arrive qu'avec le choix (écran « Difficulté ? »).
      if (!current && !isFinished(session) && session.difficultyChoice) {
        round.reset();
        stopClock();
        patchState(store, { screen: 'difficulty' });
        return;
      }
      // Sans difficulté à choisir, le premier morceau de la manche n'arrive qu'une fois l'offre réglée : passée, ou une carte déjà prise.
      if (!current && !isFinished(session) && session.handSize > 0) {
        void serveRound(session, play);
        return;
      }
      if (isFinished(session) || !current) {
        round.reset();
        stopClock();
        patchState(store, { screen: 'finished' });
        void refreshMe();
        return;
      }
      patchState(store, { screen: 'playing' });
      // Reprise d'un morceau dont le chrono tourne déjà : il repart de ce que le serveur dit qu'il reste.
      if (session.clockRemainingSeconds !== null && session.answerSeconds > 0) {
        announced = current.position;
        runClock(current.position, session.clockRemainingSeconds);
      }
      if (play) round.start(configOf(current, session.listenSeconds), null);
    };

    /**
     * Sans difficulté à choisir : l'offre encore ouverte se passe (une offre fermée entre-temps, autre onglet, n'est pas une erreur), puis le
     * premier morceau de la manche se demande et part.
     */
    const serveRound = async (session: RunSession, play: boolean): Promise<void> => {
      try {
        if (session.offer) await api.passOffer(session.sessionId, session.offer.afterRound).catch(() => undefined);
        applyPlay(await api.refreshPreview(session.sessionId), play);
      } catch {
        patchState(store, { screen: 'error' });
      } finally {
        patchState(store, { palierBusy: false });
      }
    };

    /** Relit la partie entière (avec son morceau) après un refus du serveur hors du palier ; un échec mène à l'écran d'erreur. */
    const rereadPlay = async (sessionId: number): Promise<void> => {
      try {
        // Encore dans le geste du toucher (le son est déverrouillé) : le morceau rendu part ; un choix encore ouvert ramène à l'écran.
        if (store.session()?.sessionId === sessionId) applyPlay(await api.refreshPreview(sessionId), true);
      } catch {
        patchState(store, { screen: 'error' });
      }
    };

    /** Relit l'état de la partie après un refus du serveur (offre fermée ailleurs, main changée) : l'écran montre ce qui est vrai. */
    const reread = async (sessionId: number): Promise<void> => {
      try {
        patchState(store, { session: await api.session(sessionId), pendingCard: null });
      } catch {
        // l'écran reste tel quel ; le joueur peut réessayer
      }
    };

    /** Prend une carte de l'offre (main pleine : `dropSlot` est lâchée en échange) ; la main revient du serveur. Un refus garde l'écran tel quel. */
    const take = async (card: RunCardKey, dropSlot: number | null): Promise<void> => {
      const session = store.session();
      if (!session?.offer || store.palierBusy()) return;
      patchState(store, { palierBusy: true });
      try {
        patchState(store, { session: await api.takeCard(session.sessionId, session.offer.afterRound, card, dropSlot), pendingCard: null });
      } catch {
        await reread(session.sessionId);
      } finally {
        patchState(store, { palierBusy: false });
      }
    };

    /** L'étape suivante, puis le morceau suivant (le son part ; le lecteur a été déverrouillé par un clic plus tôt) ou la fin de la partie. */
    const advance = (): void => {
      cancelAutoNext();
      if (!store.session()) return;
      patchState(store, { steps: store.steps().slice(1) });
      show(true);
    };

    /** Les formes des morceaux joués que la réponse du serveur porte (lancement, reprise) : la pile les dessine. */
    const shapesOf = (session: RunSession): Record<number, readonly number[]> => {
      const shapes: Record<number, readonly number[]> = { ...store.shapes() };
      for (const track of session.playedTracks) {
        const peaks = waveformFromBlob(track.waveform, session.listenSeconds)?.peaks;
        if (peaks) shapes[track.position] = peaks;
      }
      return shapes;
    };

    /** La partie telle que le serveur la rend (lancement, reprise, extrait redemandé) : les étapes à montrer, puis le morceau à jouer. */
    function applyPlay(play: RunPlay, startTrack: boolean): void {
      const steps = playSteps(play, store.shownRound());
      round.reset();
      stopClock();
      patchState(store, { session: play.session, current: play.current, steps, shapes: shapesOf(play.session) });
      show(startTrack);
    }

    const applyOutcome = (outcome: StartOutcome) => {
      switch (outcome.kind) {
        case 'ok':
          applyPlay(outcome.play, true);
          break;
        case 'access_denied':
          patchState(store, { screen: 'access_denied' });
          break;
        case 'no_challenge':
          patchState(store, { screen: 'no_challenge' });
          break;
        case 'already_played':
          // La partie est finie ailleurs : l'accueil la propose à nouveau comme neuve.
          void init();
          break;
        default:
          patchState(store, { screen: 'error' });
      }
    };

    /** L'écran d'un lien d'ami (`/runs/<code>`) : « lien reçu » si la playlist n'est pas jouée, la reprise si elle est en cours, la comparaison si elle est finie. */
    const openLink = async (code: string): Promise<void> => {
      const outcome = await api.challenge(code);
      if (outcome.kind !== 'ok') {
        patchState(store, { screen: outcome.kind === 'not_found' ? 'not_found' : 'error' });
        return;
      }
      const { link } = outcome;
      patchState(store, { link });
      if (link.myStatus === 'none') {
        patchState(store, { screen: 'link' });
      } else if (link.myStatus === 'pending' && link.mySessionId !== null) {
        const pending = await api.session(link.mySessionId);
        patchState(store, { screen: 'resume', resumeCount: playedCount(pending), resumeTotal: pending.rounds * pending.tracksPerRound });
      } else {
        patchState(store, { comparison: await api.comparison(link.code), screen: 'comparison' });
      }
    };

    /**
     * Premier chargement, ou « Réessayer » d'un écran d'erreur : mon accès, mon record, ma partie en cours (l'écran de reprise). Avec le code d'un
     * lien (`/runs/<code>`), l'écran de ce lien. Sans argument, le code déjà ouvert est gardé (« Réessayer », retour d'un abandon).
     */
    async function init(code?: string | null): Promise<void> {
      round.reset();
      cancelAutoNext();
      stopClock();
      announced = null;
      const target = code === undefined ? store.code() : code;
      patchState(store, {
        screen: 'loading', code: target, link: null, comparison: null, session: null, current: null, steps: [], shapes: {}, resumeCount: 0,
        resumeTotal: 0, abandonLoading: false, palierDismissedFor: null, pendingCard: null, palierBusy: false, difficultyBusy: false,
        cardBusy: false,
      });
      try {
        const me = await api.me();
        patchState(store, { me });
        if (target) {
          await openLink(target);
          return;
        }
        if (!me.hasAccess && !me.pending) {
          patchState(store, { screen: 'access_denied' });
          return;
        }
        if (me.pending) {
          const pending = await api.session(me.pending.sessionId);
          patchState(store, { screen: 'resume', resumeCount: playedCount(pending), resumeTotal: pending.rounds * pending.tracksPerRound });
          return;
        }
        patchState(store, { screen: 'welcome' });
      } catch {
        patchState(store, { screen: 'error' });
      }
    }

    const launch = async (call: () => Promise<StartOutcome>): Promise<void> => {
      patchState(store, { screen: 'loading' });
      applyOutcome(await call());
    };

    return {
      init,
      /** « Lancer une partie » ou « Reprendre » (un clic) : une partie neuve sur une playlist neuve, ou celle qui était en cours. */
      async begin(): Promise<void> {
        round.unlockAudio();
        tick.unlock();
        const code = store.link()?.code ?? store.me()?.pending?.challengeCode ?? null;
        await launch(() => (code ? api.join(code) : api.launch()));
      },
      /**
       * « Jouer » depuis le lien reçu d'un ami (un clic) : crée l'invité si ce navigateur n'a pas d'identité, relève la playlist et lance le premier
       * morceau dans ce clic.
       */
      async playLink(): Promise<void> {
        round.unlockAudio();
        tick.unlock();
        const code = store.link()?.code;
        if (!code) return;
        patchState(store, { screen: 'loading' });
        try {
          await sessionLoader.ensureGuest();
        } catch {
          patchState(store, { screen: 'error' });
          return;
        }
        applyOutcome(await api.join(code));
      },
      /** Toucher une carte de l'offre : prise tout de suite, ou, main pleine, mise en attente de la carte à lâcher (un second toucher l'annule). */
      pickCard(card: RunCardKey): void {
        const session = store.session();
        if (!session || store.palierBusy()) return;
        if (handFull(session.hand, session.handSize)) patchState(store, { pendingCard: store.pendingCard() === card ? null : card });
        else void take(card, null);
      },
      /** Toucher une carte de la main, une carte de l'offre étant en attente : l'échange. */
      dropForPending(slot: number): void {
        const pending = store.pendingCard();
        if (pending) void take(pending, slot);
      },
      /** « Passer » : l'offre se ferme sans carte ; l'écran de palier reste jusqu'à « Suite ». */
      async passOffer(): Promise<void> {
        const session = store.session();
        if (!session?.offer || store.palierBusy()) return;
        patchState(store, { palierBusy: true, pendingCard: null });
        try {
          patchState(store, { session: await api.passOffer(session.sessionId, session.offer.afterRound) });
        } catch {
          await reread(session.sessionId);
        } finally {
          patchState(store, { palierBusy: false });
        }
      },
      /**
       * Jouer une carte de la main sur le morceau en cours (un toucher). Le son se déverrouille dans le toucher : le Joker change de morceau, la
       * Rallonge relance l'écoute plus longue, et le nouveau son part à la réponse. Les autres cartes ne coupent rien : leurs effets s'affichent
       * (année, initiales, trois réponses), le chrono se recale sur ce que le serveur retient (Sablier), l'objectif sur la manche (Seuil abaissé).
       */
      async playCard(slot: number): Promise<void> {
        round.unlockAudio();
        tick.unlock();
        const session = store.session();
        const current = store.current();
        const card = session?.hand.find(c => c.slot === slot);
        if (!session || !current || !card || store.cardBusy()) return;
        patchState(store, { cardBusy: true });
        try {
          const play = await api.playCard(session.sessionId, slot, current.position);
          // La partie a pu être abandonnée ou le morceau répondu pendant l'aller-retour : une réponse périmée ne change rien.
          if (store.session()?.sessionId !== session.sessionId || store.current()?.position !== current.position) return;
          const next = play.current;
          if (card.card === 'joker' || !next || next.position !== current.position) {
            // Un autre morceau (ou un retrait) : la manche repart de la réponse, comme après « Morceau suivant ».
            announced = null;
            applyPlay(play, true);
            return;
          }
          patchState(store, { session: play.session, current: next });
          if (card.card === 'extend') {
            round.reset();
            round.start(configOf(next, play.session.listenSeconds), null);
          }
          const left = play.session.clockRemainingSeconds;
          if (left !== null && clockPosition === next.position) {
            clockDeadline = Date.now() + left * 1000;
            patchState(store, { clockLeft: left, timeUp: left <= 0 });
          }
        } catch {
          // Refusée (déjà jouée ailleurs, chrono écoulé) : la main reste telle quelle, la partie se relit.
          try {
            patchState(store, { session: await api.session(session.sessionId) });
          } catch {
            // rien à faire : le joueur peut répondre
          }
        } finally {
          patchState(store, { cardBusy: false });
        }
      },
      /**
       * Toucher une colonne de l'écran « Difficulté ? » (un clic) : le son se déverrouille dans le toucher, avant l'appel ; le choix rend le
       * premier morceau de la manche, qui part aussitôt (iPhone, comme « Commencer »).
       */
      async chooseDifficulty(difficulty: RunDifficulty): Promise<void> {
        round.unlockAudio();
        tick.unlock();
        const session = store.session();
        const choice = session?.difficultyChoice;
        if (!session || !choice || store.difficultyBusy()) return;
        patchState(store, { difficultyBusy: true });
        try {
          const play = await api.chooseDifficulty(session.sessionId, choice.round, difficulty);
          // La partie a pu être abandonnée ou rouverte pendant l'aller-retour : une réponse périmée ne relance rien.
          if (store.session()?.sessionId === session.sessionId && store.screen() === 'difficulty') applyPlay(play, true);
        } catch {
          // Refusé (choisi dans un autre onglet) ou réseau : la partie se relit et l'écran montre ce qui est vrai.
          await rereadPlay(session.sessionId);
        } finally {
          patchState(store, { difficultyBusy: false });
        }
      },
      /** « Suite » (un clic) : l'écran de palier se ferme, la manche suivante démarre (le son se déverrouille dans ce clic). */
      continueFromPalier(): void {
        round.unlockAudio();
        tick.unlock();
        // Un second toucher (double tap, réseau lent) ne relance rien.
        if (store.palierBusy() || store.screen() !== 'palier') return;
        patchState(store, { palierDismissedFor: store.session()?.round?.round ?? null, pendingCard: null, palierBusy: true });
        show(true);
        // Une suite synchrone (morceau déjà là) a quitté le palier ; une suite qui attend le serveur relâche le verrou à sa réponse.
        if (store.screen() !== 'palier') patchState(store, { palierBusy: false });
      },
      /** « Voir les autres joueurs » depuis la fin : la comparaison de cette playlist. */
      async showComparison(): Promise<void> {
        const code = store.finish()?.challengeCode ?? store.code();
        if (!code) return;
        try {
          patchState(store, { comparison: await api.comparison(code), screen: 'comparison' });
        } catch {
          patchState(store, { screen: 'error' });
        }
      },
      /**
       * La manche rend la réponse à envoyer : le serveur la corrige et marque les points, la manche la révèle. Sur un échec définitif (l'adaptateur a
       * déjà réessayé), rien n'est enregistré et le joueur reste sur le morceau avec « Réessayer » (piège 32).
       */
      async submit(submission: RoundSubmission): Promise<void> {
        const sessionId = store.session()?.sessionId;
        if (sessionId === undefined) return;
        // La forme du morceau, déjà calculée pour le lecteur : la pile la garde (la réponse du serveur n'en porte pas).
        const peaks = round.waveform()?.peaks ?? null;
        try {
          const play = await api.submitAnswer(sessionId, { position: submission.trackId, artist: submission.artist, title: submission.title });
          const shapes = peaks ? { ...store.shapes(), [submission.trackId]: peaks } : store.shapes();
          patchState(store, { session: play.session, current: play.current, steps: playSteps(play, store.shownRound()), shapes });
          stopClock();
          round.reveal();
          if (store.steps().length > 0) armAutoNext();
          else show(true);
        } catch {
          round.submissionFailed();
        }
      },
      /**
       * « Morceau suivant » (un clic) après une réponse ou un morceau retiré, sans attendre l'enchaînement automatique : l'étape suivante, puis
       * le morceau suivant (le son part dans ce clic) ou la fin de la partie.
       */
      next(): void {
        round.unlockAudio();
        tick.unlock();
        advance();
      },
      /**
       * Le premier son du morceau en cours est sorti : le chrono part, et le serveur l'apprend (une fois par morceau ; un échec n'empêche pas de
       * jouer, le serveur fait alors partir le chrono à sa limite). Appelé par le lecteur (`withHooks`), pas par la page.
       */
      firstSound(): void {
        const session = store.session();
        const current = store.current();
        if (!session || !current || session.answerSeconds <= 0 || store.steps().length > 0 || announced === current.position) return;
        announced = current.position;
        runClock(current.position, session.answerSeconds);
        void api.startClock(session.sessionId, current.position)
          .then(left => { if (left !== null) alignClock(current.position, left); })
          .catch(() => undefined);
      },
      /** Coupe (ou rétablit) l'enchaînement automatique : la page le coupe en mouvement réduit. */
      setAutoAdvance(autoAdvance: boolean): void {
        patchState(store, { autoAdvance });
        if (!autoAdvance) cancelAutoNext();
      },
      /** La page s'en va : plus de chrono ni d'enchaînement. */
      stopTimers(): void {
        cancelAutoNext();
        stopClock();
      },
      /** Abandonne la partie en cours : le serveur la ferme (elle ne compte pas pour le record), l'écran revient à l'accueil du mode. */
      async abandon(): Promise<void> {
        const sessionId = store.session()?.sessionId ?? store.link()?.mySessionId ?? store.me()?.pending?.sessionId;
        if (sessionId === undefined) return;
        patchState(store, { abandonLoading: true });
        cancelAutoNext();
        try {
          await api.abandon(sessionId);
          await init();
        } catch {
          // la partie reste en cours : le joueur peut réessayer
          patchState(store, { abandonLoading: false });
        }
      },
      /** « Nouvelle partie » depuis la fin (un clic) : une playlist neuve, le premier morceau lancé dans ce clic. */
      async playAgain(): Promise<void> {
        round.unlockAudio();
        tick.unlock();
        patchState(store, { me: store.me() ? { ...store.me()!, pending: null } : null });
        await launch(() => api.launch());
      },
    };
  }),
  withHooks({
    onInit(store) {
      const round = inject(TrackRoundStore);
      inject(DestroyRef).onDestroy(() => store.stopTimers());
      // Le premier son de chaque morceau fait partir son chrono.
      effect(() => {
        if (round.phase() === 'playing') untracked(() => store.firstSound());
      });
    },
  }),
);

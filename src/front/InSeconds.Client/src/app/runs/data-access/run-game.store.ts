import { DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { SessionLoader } from '../../account/data-access/session-loader';
import { normalizePseudo, pseudoIssue } from '../../account/domain/pseudo';
import { toAppError } from '../../core/errors/app-error';
import { errorMessageKey } from '../../core/errors/error-messages';
import { SessionStore } from '../../core/session/session.store';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RoundConfig, RoundSubmission } from '../../gameplay/domain/track-round';
import { waveformFromBlob } from '../../gameplay/domain/waveform';
import {
  AUTO_NEXT_MS, CLOCK_ALERT_SECONDS, COMBO_MIN, PileEntry, RunComparison, RunCurrentTrack, RunDifficulty, RunLink, RunPlay, RunRound, RunSession, RunStep, RunsMe,
  isFinished,
  comboOf, duelOf, ghostGap, nextObjective, progressKey, palierDue, playSteps, playedCount, runPile, stepPosition,
} from '../domain/run';
import { RunSounds } from './run-sounds';
import { RunsApi, StartOutcome } from './runs.api';

/** Le pas du chrono affiché. */
const CLOCK_TICK_MS = 200;

/**
 * L'écran affiché : le chargement, l'accueil du mode (lancer), le lien reçu d'un ami, la reprise d'une partie en cours, la partie (la carte du
 * morceau, sa réponse ou le morceau retiré, et la pile du run), la fin, la comparaison des joueurs d'une playlist, et les refus (pas d'accès sur
 * invitation, que la page traduit en retour au jeu du jour ; pas de playlist ; playlist inconnue ; erreur).
 */
export type RunScreen =
  | 'loading' | 'welcome' | 'theme' | 'link' | 'resume' | 'playing' | 'palier' | 'difficulty' | 'finished' | 'pseudo' | 'comparison' | 'access_denied' | 'no_challenge'
  | 'not_found' | 'error';

interface RunState {
  screen: RunScreen;
  /** La playlist du lien ouvert (`/setlist/<code>`) ; `null` sur `/setlist`. */
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
  /** « Suite » du palier part (un second toucher ne relance rien). */
  palierBusy: boolean;
  /** Le choix du thème envoyé au serveur (écran `theme`) : l'identifiant d'un thème proposé, `'mystery'` pour « Thème mystère » ; `null` : rien choisi. */
  themePicked: number | 'mystery' | null;
  /** Le nom du thème que le serveur a retenu pour ce choix, dès qu'il a répondu (l'écran le révèle, puis laisse la manche suivre) ; `null` d'ici là. */
  themeResult: string | null;
  /** Le pseudo de l'invité est en route vers le serveur (écran `pseudo`). */
  pseudoBusy: boolean;
  /** La clé de traduction du refus de la dernière saisie du pseudo, `null` sans refus. */
  pseudoError: string | null;
  /** Le choix de la difficulté part au serveur. */
  difficultyBusy: boolean;
  /** Un échange de morceau part au serveur. */
  cardBusy: boolean;
  /** Le serveur a refusé l'échange (déjà fait ailleurs, morceau déjà écouté) : un court message le dit, jusqu'au prochain essai. */
  cardRefused: boolean;
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
  palierBusy: false,
  themePicked: null,
  themeResult: null,
  pseudoBusy: false,
  pseudoError: null,
  difficultyBusy: false,
  cardBusy: false,
  cardRefused: false,
};

/** Les phases où le morceau se change : la saisie (ni l'envoi d'une réponse, ni sa révélation). */
const canSwapTrack = (phase: string | null): boolean => phase === 'loading' || phase === 'playing' || phase === 'listened';

/** Les appels qui changent la partie côté serveur. */
const CHANGING_CALLS: ReadonlySet<string> = new Set([
  'launch', 'join', 'refreshPreview', 'submitAnswer', 'swap', 'chooseTheme', 'chooseDifficulty', 'abandon',
]);

/** L'adaptateur, dont les appels qui changent la partie comptent leurs requêtes en route (`+1` au départ, `-1` à l'arrivée ou à l'échec). */
function trackChanges(api: RunsApi, count: (delta: number) => void): RunsApi {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string' || !CHANGING_CALLS.has(property)) return value;
      return (...args: unknown[]) => {
        count(1);
        return (value.apply(target, args) as Promise<unknown>).finally(() => count(-1));
      };
    },
  });
}

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
  withComputed((store, round = inject(TrackRoundStore)) => {
    const step = computed<RunStep | null>(() => store.steps()[0] ?? null);
    const clockLeft = store.clockLeft;
    return {
      rounds: computed(() => store.session()?.rounds ?? 0),
      step,
      totalScore: computed(() => store.session()?.totalScore ?? 0),
      /** La série de bonnes réponses d'affilée (sans aucun point), quand elle atteint `COMBO_MIN` ; `null` en dessous. */
      combo: computed(() => { const combo = comboOf(store.session()?.playedTracks ?? []); return combo >= COMBO_MIN ? combo : null; }),
      /** L'écart avec le fantôme de l'ami qui a lancé la playlist, au dernier morceau répondu. */
      ghost: computed(() => ghostGap(store.session())),
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
        const session = store.session();
        if (!session || session.answerSeconds <= 0) return null;
        return clockLeft() ?? session.answerSeconds;
      }),
      /** Les dernières secondes du chrono : gros chiffre, bord de la carte éclairci. */
      clockAlert: computed(() => { const left = clockLeft(); return left !== null && left > 0 && left <= CLOCK_ALERT_SECONDS; }),
      record: computed(() => store.me()?.record ?? null),
      /** L'étagère des disques gagnés (l'accueil du mode). */
      shelf: computed(() => store.me()?.shelf ?? []),
      level: computed(() => store.me()?.level ?? null),
      /** « Rejouer » : seulement avec l'accès (retiré en cours de partie, la partie se finit, mais pas d'autre). */
      canPlayAgain: computed(() => store.me()?.hasAccess === true),
      finish: computed(() => store.session()?.finish ?? null),
      duel: computed(() => duelOf(store.session())),
      /** Ce que les cartes actives révèlent sur le morceau en cours, et l'Échange offert ; rien tant qu'une étape reste à montrer. */
      roundCards: computed(() => {
        const session = store.session();
        const current = store.current();
        if (!session || !current || store.steps().length > 0) return null;
        return {
          effects: current.effects ?? null,
          values: session.cardValues,
          listenSeconds: current.listenSeconds ?? session.listenSeconds,
          swapAvailable: session.swapAvailable && canSwapTrack(round.phase()),
          refused: store.cardRefused(),
        };
      }),
      /** Ce que montre l'écran « Choisis ton thème » : la manche, les deux thèmes, le choix envoyé et le thème retenu. */
      themeScreen: computed(() => {
        const session = store.session();
        const choice = session?.themeChoice;
        if (store.screen() !== 'theme' || !session?.round || !choice) return null;
        return {
          choice,
          picked: store.themePicked(),
          result: store.themeResult(),
          headerRound: { round: session.round.round, score: 0, objective: session.round.objective, maxScore: session.round.maxScore },
        };
      }),
      /** Ce que montre l'écran « Difficulté ? » : la manche, le score du run, les difficultés proposées. */
      difficulty: computed(() => {
        const session = store.session();
        const choice = session?.difficultyChoice;
        if (store.screen() !== 'difficulty' || !session?.round || !choice) return null;
        return {
          round: choice.round,
          totalScore: session.totalScore,
          options: choice.options,
          tracksPerRound: session.tracksPerRound,
          listenSeconds: session.listenSeconds,
          headerRound: { round: session.round.round, score: 0, objective: session.round.objective, maxScore: session.round.maxScore },
        };
      }),
      /** Ce que montre l'écran de palier : la manche passée, la carte gagnée, la suivante et ses difficultés. */
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
          /** La carte gagnée à cette manche, qui agira sur la suivante ; `null` si elle n'a rien rapporté. */
          earnedCard: session.hand.at(0)?.card ?? null,
          /** Les difficultés de la manche, quand elles se choisissent ici (un seul écran) ; `null` : rien à choisir, « Suite » lance la manche. */
          options: session.difficultyChoice?.options ?? null,
          tracksPerRound: session.tracksPerRound,
          listenSeconds: session.listenSeconds,
          /** L'en-tête : la barre du run sur la manche à venir, pas encore commencée. */
          headerRound: { round: session.round.round, score: 0, objective: session.round.objective, maxScore: session.round.maxScore },
        };
      }),
    };
  }),
  withMethods((store, rawApi = inject(RunsApi), round = inject(TrackRoundStore), sessionLoader = inject(SessionLoader), sounds = inject(RunSounds), session = inject(SessionStore)) => {
    /** Les requêtes en route qui changent la partie côté serveur : tant qu'il y en a une, une relecture d'un autre onglet ne conclut rien. */
    let changing = 0;
    /** La partie rendue au choix du thème, appliquée quand l'écran a fini de révéler le thème. */
    let themePlay: RunPlay | null = null;
    const api = trackChanges(rawApi, delta => { changing += delta; });
    /** L'enchaînement automatique en attente. */
    let autoNextTimer: ReturnType<typeof setTimeout> | null = null;
    /** Le chrono en cours : son échéance (horloge du navigateur, en ms), son pas, et le morceau qu'il chronomètre. */
    let clockDeadline = 0;
    let clockTimer: ReturnType<typeof setInterval> | null = null;
    let clockPosition: number | null = null;
    /** Le dernier morceau dont le premier son a été annoncé au serveur. */
    let announced: number | null = null;
    /** Les morceaux remplacés par un Échange depuis le chargement : le morceau de réserve, à la même place, est un autre morceau pour la manche. */
    let replaced = 0;

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
        // Un tic à chaque seconde des dernières ; `RunSounds` se tait pendant un extrait (il couvrirait le morceau).
        if (whole !== lastWhole && whole > 0 && whole <= CLOCK_ALERT_SECONDS) sounds.play('tick');
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

    /**
     * Remet le chrono qui tourne sur ce que le serveur retient après un coup de pouce (le Délai en ajoute) ; il repart s'il venait de s'arrêter.
     * Rien si le temps écoulé a déjà envoyé la réponse, ni avant le premier son (le chrono partira plein, Délai compris).
     */
    const setClock = (position: number, seconds: number): void => {
      if (clockPosition !== position || store.timeUp()) return;
      stopClock();
      runClock(position, seconds);
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
      trackKey: `${current.position}:${replaced}`,
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

    /** La fin de la partie. Son de la fin qui vient d'arriver, pas d'une partie finie qu'on rouvre. */
    const showEnd = (session: RunSession): void => {
      const justEnded = store.screen() === 'playing';
      round.reset();
      stopClock();
      patchState(store, { screen: 'finished' });
      if (justEnded && (session.status === 'won' || session.status === 'lost')) sounds.play(session.finish?.record?.isNew ? 'record' : session.status);
      void refreshMe();
    };

    /** L'écran de palier. Les sons seulement pour une manche qui vient d'être passée, pas pour un palier retrouvé à la reprise ou à une relecture. */
    const showPalier = (session: RunSession): void => {
      const justPassed = store.screen() === 'playing';
      round.reset();
      stopClock();
      patchState(store, { screen: 'palier' });
      if (!justPassed) return;
      sounds.play('roundPassed');
      // La manche a rapporté une carte : un second son, plus doux, le dit.
      if (session.hand.length > 0) sounds.play('cardTaken');
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
        showPalier(session);
        return;
      }
      const current = store.current();
      // La manche à thème attend le choix du créateur : rien n'est servi avant (écran « Choisis ton thème »).
      if (!current && !isFinished(session) && session.themeChoice) {
        round.reset();
        stopClock();
        patchState(store, { screen: 'theme' });
        return;
      }
      // La manche attend sa difficulté : son premier morceau n'arrive qu'avec le choix (écran « Difficulté ? »).
      if (!current && !isFinished(session) && session.difficultyChoice) {
        round.reset();
        stopClock();
        patchState(store, { screen: 'difficulty' });
        return;
      }
      // Sans difficulté à choisir, le premier morceau de la manche se demande au serveur.
      if (!current && !isFinished(session)) {
        void serveRound(session, play);
        return;
      }
      if (isFinished(session) || !current) {
        showEnd(session);
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

    /** Sans difficulté à choisir : le premier morceau de la manche se demande et part. */
    const serveRound = async (session: RunSession, play: boolean): Promise<void> => {
      try {
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

    /** Relit l'état de la partie après un refus du serveur (échange fait ailleurs) : l'écran montre ce qui est vrai. */
    const reread = async (sessionId: number): Promise<void> => {
      try {
        const session = await api.session(sessionId);
        // La partie a pu être abandonnée pendant l'aller-retour : une relecture périmée ne la ramène pas.
        if (store.session()?.sessionId === sessionId) patchState(store, { session });
      } catch {
        // l'écran reste tel quel ; le joueur peut réessayer
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

    /** Un invité qui n'a pas encore de pseudo le donne avant de voir la comparaison (il y figurera, à côté de son score). */
    const needsPseudo = (): boolean => session.player()?.isGuest === true && !session.player()?.pseudo;

    /** La comparaison de la playlist, ou l'écran du pseudo d'abord pour un invité qui n'en a pas. */
    const loadComparison = async (code: string): Promise<void> => {
      patchState(store, { comparison: await api.comparison(code), screen: 'comparison' });
    };
    const openComparison = async (code: string): Promise<void> => {
      if (needsPseudo()) {
        patchState(store, { code, screen: 'pseudo', pseudoError: null });
        return;
      }
      await loadComparison(code);
    };

    /** L'écran d'un lien d'ami (`/setlist/<code>`) : « lien reçu » si la playlist n'est pas jouée, la reprise si elle est en cours, la comparaison si elle est finie. */
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
        await openComparison(link.code);
      }
    };

    /**
     * Premier chargement, ou « Réessayer » d'un écran d'erreur : mon accès, mon record, ma partie en cours (l'écran de reprise). Avec le code d'un
     * lien (`/setlist/<code>`), l'écran de ce lien. Sans argument, le code déjà ouvert est gardé (« Réessayer », retour d'un abandon).
     */
    async function init(code?: string | null): Promise<void> {
      round.reset();
      cancelAutoNext();
      stopClock();
      announced = null;
      const target = code === undefined ? store.code() : code;
      patchState(store, {
        screen: 'loading', code: target, link: null, comparison: null, session: null, current: null, steps: [], shapes: {}, resumeCount: 0,
        resumeTotal: 0, abandonLoading: false, palierDismissedFor: null, palierBusy: false, difficultyBusy: false, themePicked: null, themeResult: null,
        cardBusy: false, cardRefused: false,
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

    /** Une action de cet onglet en route (réponse, carte, choix, extrait redemandé) : la relecture la prendrait pour un autre onglet. */
    const settled = (): boolean =>
      changing === 0 && round.phase() !== 'submitting' && !store.cardBusy() && !store.palierBusy() && !store.difficultyBusy() && store.themePicked() === null;

    /** En jeu : la partie se relit ; finie ailleurs, l'écran de fin ; avancée ailleurs, l'écran de reprise ; rien n'a bougé, rien ne change. */
    const refreshGame = async (screen: ReturnType<typeof store.screen>, session: NonNullable<ReturnType<typeof store.session>>): Promise<void> => {
      if (!settled()) return;
      try {
        const fresh = await api.session(session.sessionId);
        // Comparée à l'état d'avant la lecture, et seulement si rien n'a bougé ici pendant : sinon, c'est cet onglet qui a avancé.
        if (store.session() !== session || store.screen() !== screen || !settled() || progressKey(fresh) === progressKey(session)) return;
        if (fresh.status === 'won' || fresh.status === 'lost') {
          round.reset();
          cancelAutoNext();
          stopClock();
          patchState(store, { session: fresh, current: null, steps: [], screen: 'finished' });
          void refreshMe();
        } else {
          await init();
        }
      } catch {
        // hors ligne : la partie continue telle quelle
      }
    };

    /** Sur l'accueil ou la reprise du mode : la partie en cours (ou son absence), le record et l'étagère se relisent. */
    const refreshHome = async (screen: ReturnType<typeof store.screen>): Promise<void> => {
      try {
        const before = store.me();
        const me = await api.me();
        // Le joueur a bougé pendant la lecture (une partie lancée, reprise) : rien à conclure.
        if (store.screen() !== screen || store.me() !== before || changing > 0) return;
        // Une autre partie en cours (ou plus aucune) : l'écran se reconstruit ; sinon le record et l'étagère se mettent à jour.
        if ((me.pending?.sessionId ?? null) !== (before?.pending?.sessionId ?? null)) await init();
        else patchState(store, { me });
      } catch {
        // hors ligne : l'écran reste tel quel
      }
    };

    return {
      init,
      /** « Lancer une partie » ou « Reprendre » (un clic) : une partie neuve sur une playlist neuve, ou celle qui était en cours. */
      async begin(): Promise<void> {
        round.unlockAudio();
        sounds.unlock();
        const code = store.link()?.code ?? store.me()?.pending?.challengeCode ?? null;
        if (code) await launch(() => api.join(code));
        else await launch(() => api.launch());
      },
      /**
       * Le thème de la manche, juste avant elle (le créateur seulement) : un des deux thèmes, ou `null` pour « Thème mystère », que le serveur tire.
       * La réponse porte la partie telle qu'elle sera ; l'écran la garde le temps de révéler le thème (`continueFromTheme()`), sans rien jouer.
       */
      async chooseTheme(themeId: number | null): Promise<void> {
        const session = store.session();
        const choice = session?.themeChoice;
        if (!session || !choice || store.screen() !== 'theme' || store.themePicked() !== null) return;
        patchState(store, { themePicked: themeId ?? 'mystery', themeResult: null });
        try {
          const play = await api.chooseTheme(session.sessionId, choice.round, themeId);
          // La partie a pu être abandonnée ou rouverte pendant l'aller-retour : une réponse périmée ne montre rien.
          if (store.session()?.sessionId !== session.sessionId || store.screen() !== 'theme') return;
          themePlay = play;
          patchState(store, { themeResult: play.session.themes.find(t => t.round === choice.round)?.name ?? '' });
        } catch {
          // Refusé (choisi dans un autre onglet) ou réseau : la partie se relit et l'écran montre ce qui est vrai.
          themePlay = null;
          patchState(store, { themePicked: null, themeResult: null });
          await init();
        }
      },
      /** Le thème est révélé : la manche suit (l'écran de palier ou de difficulté), sans son. */
      continueFromTheme(): void {
        const play = themePlay;
        themePlay = null;
        patchState(store, { themePicked: null, themeResult: null });
        if (play && store.screen() === 'theme') applyPlay(play, false);
      },
      /**
       * « Jouer » depuis le lien reçu d'un ami (un clic) : crée l'invité si ce navigateur n'a pas d'identité, relève la playlist et lance le premier
       * morceau dans ce clic.
       */
      async playLink(): Promise<void> {
        round.unlockAudio();
        sounds.unlock();
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
      /**
       * « Changer de morceau » (un toucher, une fois par manche) : le son se déverrouille dans le toucher, le serveur rend le morceau de réserve à la
       * même place, qui part aussitôt. La réponse attend la fin de l'aller-retour (`cardBusy` verrouille la saisie) : elle serait corrigée sur le
       * mauvais morceau.
       */
      async swap(): Promise<void> {
        round.unlockAudio();
        sounds.unlock();
        const session = store.session();
        const current = store.current();
        if (!session || !current || !session.swapAvailable || store.cardBusy() || !canSwapTrack(round.phase())) return;
        patchState(store, { cardBusy: true, cardRefused: false });
        try {
          const play = await api.swap(session.sessionId, current.position);
          // La partie a pu être abandonnée ou le morceau répondu pendant l'aller-retour : une réponse périmée ne change rien.
          if (store.session()?.sessionId !== session.sessionId || store.current()?.position !== current.position) return;
          // Le morceau de réserve (à la même place) ou un retrait : la manche repart de la réponse, comme après « Morceau suivant ».
          announced = null;
          replaced++;
          applyPlay(play, true);
        } catch {
          // Refusé (déjà fait ailleurs, morceau déjà écouté) : le joueur en est prévenu, la partie se relit.
          patchState(store, { cardRefused: true });
          await reread(session.sessionId);
        } finally {
          patchState(store, { cardBusy: false });
        }
      },
      /**
       * « Jouer » sur l'écran de palier (les colonnes y sont) ou sur « Difficulté ? » (un clic) : le son se déverrouille dans le toucher, avant l'appel ; le choix rend le
       * premier morceau de la manche, qui part aussitôt (iPhone, comme « Commencer »).
       */
      async chooseDifficulty(difficulty: RunDifficulty): Promise<void> {
        round.unlockAudio();
        sounds.unlock();
        const session = store.session();
        const choice = session?.difficultyChoice;
        if (!session || !choice || store.difficultyBusy()) return;
        const from = store.screen();
        if (from !== 'difficulty' && from !== 'palier') return;
        patchState(store, { difficultyBusy: true });
        try {
          const play = await api.chooseDifficulty(session.sessionId, choice.round, difficulty);
          // La partie a pu être abandonnée ou rouverte pendant l'aller-retour : une réponse périmée ne relance rien.
          if (store.session()?.sessionId === session.sessionId && store.screen() === from) applyPlay(play, true);
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
        sounds.unlock();
        // Un second toucher (double tap, réseau lent) ne relance rien.
        if (store.palierBusy() || store.screen() !== 'palier') return;
        patchState(store, { palierDismissedFor: store.session()?.round?.round ?? null, palierBusy: true });
        show(true);
        // Une suite synchrone (morceau déjà là) a quitté le palier ; une suite qui attend le serveur relâche le verrou à sa réponse.
        if (store.screen() !== 'palier') patchState(store, { palierBusy: false });
      },
      /** « Voir les autres joueurs » depuis la fin : la comparaison de cette playlist. */
      async showComparison(): Promise<void> {
        const code = store.finish()?.challengeCode ?? store.code();
        if (!code) return;
        try {
          await openComparison(code);
        } catch {
          patchState(store, { screen: 'error' });
        }
      },
      /** Le crayon de la comparaison : l'invité change son pseudo (le compte le change dans son profil). */
      editPseudo(): void {
        if (session.player()?.isGuest === true) patchState(store, { screen: 'pseudo', pseudoError: null });
      },
      /** Retour de l'écran du pseudo à la comparaison, sans rien changer (un pseudo existe déjà). */
      cancelPseudo(): void {
        patchState(store, { screen: 'comparison', pseudoError: null });
      },
      /** Enregistre le pseudo de l'invité puis ouvre la comparaison ; un refus (déjà pris par un compte, saisie invalide) reste sur l'écran. */
      async savePseudo(raw: string): Promise<void> {
        const issue = pseudoIssue(raw);
        if (issue) {
          patchState(store, { pseudoError: `runs.pseudo.${issue}` });
          return;
        }
        patchState(store, { pseudoBusy: true, pseudoError: null });
        try {
          await sessionLoader.setGuestPseudo(normalizePseudo(raw));
        } catch (error) {
          const { code } = await toAppError(error);
          patchState(store, { pseudoBusy: false, pseudoError: code === 'players.pseudo_taken' ? 'runs.pseudo.taken' : errorMessageKey(code) });
          return;
        }
        patchState(store, { pseudoBusy: false });
        const code = store.code();
        if (!code) return;
        try {
          await loadComparison(code);
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
        sounds.unlock();
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
      /**
       * L'onglet revient au premier plan : la partie a pu avancer ou finir dans un autre onglet. En jeu, elle se relit : finie, l'écran de fin ;
       * avancée, l'écran de reprise (le prochain son partira d'un toucher) ; rien n'a bougé, rien ne change. Jamais pendant un envoi (la
       * réponse en route ferait croire à une partie avancée ailleurs). Sur l'accueil ou la reprise du mode, la partie en cours se relit aussi.
       */
      async refresh(): Promise<void> {
        const screen = store.screen();
        const session = store.session();
        if ((screen === 'playing' || screen === 'palier' || screen === 'difficulty' || screen === 'theme') && session) return refreshGame(screen, session);
        if ((screen === 'welcome' || screen === 'resume') && !store.code()) return refreshHome(screen);
      },
      /** Les sons d'interface sont coupés (le bouton de l'en-tête). */
      soundsMuted: sounds.muted,
      /** Couper ou remettre les sons d'interface (retenu dans ce navigateur) ; un toucher sur le bouton réveille aussi le son. */
      toggleSounds(): void {
        sounds.unlock();
        sounds.toggleMuted();
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
      /** « Rejouer » depuis la fin (un clic) : une playlist neuve, le premier morceau lancé dans ce clic. */
      async playAgain(): Promise<void> {
        round.unlockAudio();
        sounds.unlock();
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

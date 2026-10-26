import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RoundConfig, RoundSubmission } from '../../gameplay/domain/track-round';
import {
  PillState, RunCurrentTrack, RunPlay, RunRound, RunSession, RunStep, RunTrack, RunsMe, isFinished, playSteps, playedCount, trackPills,
} from '../domain/run';
import { RunsApi, StartOutcome } from './runs.api';

/**
 * L'écran affiché : le chargement, l'accueil du mode (lancer), la reprise d'une partie en cours, la partie (avec la carte de réponse ou du
 * morceau retiré), le bilan d'une manche, la fin, et les refus (pas d'accès sur invitation, que la page traduit en retour au jeu du jour ; pas de
 * playlist ; erreur).
 */
export type RunScreen = 'loading' | 'welcome' | 'resume' | 'playing' | 'round_end' | 'finished' | 'access_denied' | 'no_challenge' | 'error';

interface RunState {
  screen: RunScreen;
  me: RunsMe | null;
  session: RunSession | null;
  /** Le morceau à jouer (ou, tant que des étapes restent à montrer, celui que le dernier clic lancera). */
  current: RunCurrentTrack | null;
  /**
   * Ce qu'il reste à montrer avant de jouer `current` : la réponse au morceau, un morceau retiré, le bilan d'une manche. La première est à
   * l'écran ; chaque clic passe à la suivante (cf. `playSteps`).
   */
  steps: readonly RunStep[];
  /** La partie en cours que l'écran de reprise propose : combien de morceaux sont déjà joués, sur combien. */
  resumeCount: number;
  resumeTotal: number;
  abandonLoading: boolean;
}

const initialState: RunState = {
  screen: 'loading',
  me: null,
  session: null,
  current: null,
  steps: [],
  resumeCount: 0,
  resumeTotal: 0,
  abandonLoading: false,
};

/**
 * La partie de Run : l'écran, la partie en cours, le morceau à jouer, les étapes à montrer. À fournir à la page (avec `TrackRoundStore`, qu'il
 * pilote) ; la route fournit l'adaptateur de l'API et le lecteur (`provideGameplay()`). Le serveur décide de tout (points, jauge, neutralisation,
 * fin) : le store affiche ce qu'il rend.
 *
 * **Le son ne démarre que sur un clic du joueur** : `begin()`, `next()` et `playAgain()` lancent la manche ; jamais l'arrivée sur la route, un
 * `effect` ni une réponse du serveur (un morceau retiré pendant la redemande de son extrait attend le clic « Morceau suivant »). Ils commencent
 * par `round.unlockAudio()`, **avant tout `await`** (iPhone : un son lancé hors du geste reste muet).
 */
export const RunGameStore = signalStore(
  withState<RunState>(initialState),
  withComputed(store => {
    const rounds = computed(() => store.session()?.rounds ?? 0);
    const tracksPerRound = computed(() => store.session()?.tracksPerRound ?? 0);
    const step = computed<RunStep | null>(() => store.steps()[0] ?? null);
    /** Les morceaux déjà joués de la manche affichée : ceux de l'étape à l'écran, sinon ceux de la manche en cours. */
    const shownTracks = computed<readonly RunTrack[]>(() => {
      const shown = step();
      if (!shown) return store.session()?.roundTracks ?? [];
      return shown.kind === 'summary' ? shown.summary.tracks : shown.tracks;
    });
    return {
      rounds,
      tracksPerRound,
      step,
      totalScore: computed(() => store.session()?.totalScore ?? 0),
      /** La manche telle que l'écran la montre : celle de l'étape à l'écran, sinon celle du morceau en cours. */
      shownRound: computed<RunRound | null>(() => step()?.round ?? store.session()?.round ?? null),
      shownTracks,
      /** Le morceau auquel le joueur vient de répondre : la carte de réponse s'affiche tant que « Morceau suivant » n'est pas cliqué. */
      revealed: computed(() => { const shown = step(); return shown?.kind === 'revealed' ? shown.track : null; }),
      /** Le morceau retiré de la manche à l'écran (carte « Morceau retiré ») : l'objectif d'avant est barré. */
      withdrawn: computed(() => { const shown = step(); return shown?.kind === 'neutralized' ? shown : null; }),
      /** Le bilan de la manche à l'écran. */
      summary: computed(() => { const shown = step(); return shown?.kind === 'summary' ? shown.summary : null; }),
      /** Les points gagnés sur le morceau qui vient d'être répondu (« +67 »), vides tant que le joueur n'a pas répondu. */
      gain: computed(() => { const shown = step(); return shown?.kind === 'revealed' ? shown.track.points : null; }),
      /** Les pastilles de la manche affichée : le morceau en cours est en corail tant que le joueur n'a pas répondu. */
      pills: computed<PillState[]>(() => trackPills(tracksPerRound(), shownTracks(), step() === null && store.current() !== null)),
      /** « Morceau n sur N » : le morceau en cours, ou celui dont la carte est affichée. */
      positionInRound: computed(() => {
        const shown = step();
        if (shown && shown.kind !== 'summary') return shown.tracks.length;
        return store.current()?.positionInRound ?? 0;
      }),
      /** Le prochain clic mène au bilan de la manche (le bouton de la carte l'annonce). */
      nextIsSummary: computed(() => store.steps()[1]?.kind === 'summary'),
      /** Le prochain clic du bilan mène à la fin de la partie (manche ratée, ou dernière manche) : le bouton l'annonce. */
      summaryEndsRun: computed(() => store.steps().length === 1 && store.session() !== null && isFinished(store.session()!)),
      record: computed(() => store.me()?.record ?? null),
      /** « Nouvelle partie » : seulement avec l'accès (retiré en cours de partie, la partie se finit, mais pas d'autre). */
      canPlayAgain: computed(() => store.me()?.hasAccess === true),
      finish: computed(() => store.session()?.finish ?? null),
    };
  }),
  withMethods((store, api = inject(RunsApi), round = inject(TrackRoundStore)) => {
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
      // Écoute fixe : un seul palier, pas de « écouter plus » ; la relecture (↺) reste possible. Pas d'indice.
      listen: { steps: [listenSeconds], extendable: false },
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
        patchState(store, { screen: step.kind === 'summary' ? 'round_end' : 'playing' });
        return;
      }
      const current = store.current();
      if (isFinished(session) || !current) {
        round.reset();
        patchState(store, { screen: 'finished' });
        void refreshMe();
        return;
      }
      patchState(store, { screen: 'playing' });
      if (play) round.start(configOf(current, session.listenSeconds), null);
    };

    /** La partie telle que le serveur la rend (lancement, reprise, extrait redemandé) : les étapes à montrer, puis le morceau à jouer. */
    function applyPlay(play: RunPlay, startTrack: boolean): void {
      const steps = playSteps(play, store.shownRound());
      round.reset();
      patchState(store, { session: play.session, current: play.current, steps });
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

    /** Premier chargement, ou « Réessayer » d'un écran d'erreur : mon accès, mon record, ma partie en cours (l'écran de reprise). */
    async function init(): Promise<void> {
      round.reset();
      patchState(store, { screen: 'loading', session: null, current: null, steps: [], resumeCount: 0, resumeTotal: 0, abandonLoading: false });
      try {
        const me = await api.me();
        patchState(store, { me });
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
        const pending = store.me()?.pending ?? null;
        await launch(() => (pending ? api.join(pending.challengeCode) : api.launch()));
      },
      /**
       * La manche rend la réponse à envoyer : le serveur la corrige et marque les points, la manche la révèle. Sur un échec définitif (l'adaptateur a
       * déjà réessayé), rien n'est enregistré et le joueur reste sur le morceau avec « Réessayer » (piège 32).
       */
      async submit(submission: RoundSubmission): Promise<void> {
        const sessionId = store.session()?.sessionId;
        if (sessionId === undefined) return;
        try {
          const play = await api.submitAnswer(sessionId, { position: submission.trackId, artist: submission.artist, title: submission.title });
          patchState(store, { session: play.session, current: play.current, steps: playSteps(play, store.shownRound()) });
          round.reveal();
        } catch {
          round.submissionFailed();
        }
      },
      /**
       * Le bouton de l'étape à l'écran (un clic) : « Morceau suivant » après une réponse ou un morceau retiré, « Manche suivante » depuis le bilan.
       * Il mène à l'étape suivante, puis au morceau suivant (le son part dans ce clic) ou à la fin de la partie.
       */
      next(): void {
        round.unlockAudio();
        if (!store.session()) return;
        patchState(store, { steps: store.steps().slice(1) });
        show(true);
      },
      /** Abandonne la partie en cours : le serveur la ferme (elle ne compte pas pour le record), l'écran revient à l'accueil du mode. */
      async abandon(): Promise<void> {
        const sessionId = store.session()?.sessionId ?? store.me()?.pending?.sessionId;
        if (sessionId === undefined) return;
        patchState(store, { abandonLoading: true });
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
        patchState(store, { me: store.me() ? { ...store.me()!, pending: null } : null });
        await launch(() => api.launch());
      },
    };
  }),
);

import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { RoundConfig, RoundSubmission } from '../../gameplay/domain/track-round';
import {
  PillState, RunCurrentTrack, RunNeutralized, RunPlay, RunRound, RunRoundSummary, RunSession, RunTrack, RunsMe, isFinished, trackPills,
} from '../domain/run';
import { RunsApi, StartOutcome } from './runs.api';

/**
 * L'écran affiché : le chargement, l'accueil du mode (lancer ou reprendre), la partie, le bilan d'une manche, la fin, et les refus (pas
 * d'accès sur invitation, que la page traduit en retour au jeu du jour ; pas de playlist ; erreur).
 */
export type RunScreen = 'loading' | 'welcome' | 'playing' | 'round_end' | 'finished' | 'access_denied' | 'no_challenge' | 'error';

interface RunState {
  screen: RunScreen;
  me: RunsMe | null;
  session: RunSession | null;
  /** Le morceau à jouer (ou, une fois la réponse affichée, celui que « Morceau suivant » lancera). */
  current: RunCurrentTrack | null;
  /** La manche telle que l'écran la montre : celle du morceau en cours, ou, juste après la réponse, celle qui vient de finir. */
  shownRound: RunRound | null;
  /** Le morceau auquel le joueur vient de répondre : la carte de réponse s'affiche tant que « Morceau suivant » n'est pas cliqué. */
  revealed: RunTrack | null;
  /** Les manches qui viennent de se terminer avec cette réponse (le bilan suit « Morceau suivant »). */
  summaries: readonly RunRoundSummary[];
  /** Les morceaux que le serveur vient de neutraliser (extrait introuvable) : l'écran du morceau retiré les montrera. */
  neutralized: readonly RunNeutralized[];
  abandonLoading: boolean;
}

const initialState: RunState = {
  screen: 'loading',
  me: null,
  session: null,
  current: null,
  shownRound: null,
  revealed: null,
  summaries: [],
  neutralized: [],
  abandonLoading: false,
};

/**
 * La partie de Run : l'écran, la partie en cours, le morceau à jouer, la réponse affichée. À fournir à la page (avec `TrackRoundStore`, qu'il
 * pilote) ; la route fournit l'adaptateur de l'API et le lecteur (`provideGameplay()`). Le serveur décide de tout (points, jauge, neutralisation,
 * fin) : le store affiche ce qu'il rend.
 *
 * **Le son ne démarre que sur un clic du joueur** : `begin()`, `nextTrack()` et `nextRound()` lancent la manche ; jamais l'arrivée sur la route
 * ni un `effect`. Ils commencent par `round.unlockAudio()`, **avant tout `await`** (iPhone : un son lancé hors du geste reste muet).
 */
export const RunGameStore = signalStore(
  withState<RunState>(initialState),
  withComputed(store => {
    const rounds = computed(() => store.session()?.rounds ?? 0);
    const tracksPerRound = computed(() => store.session()?.tracksPerRound ?? 0);
    /** Les morceaux déjà joués de la manche affichée : après la dernière réponse d'une manche, ceux du bilan. */
    const shownTracks = computed<readonly RunTrack[]>(() => {
      const [summary] = store.summaries();
      if (store.revealed() && summary) return summary.tracks;
      return store.session()?.roundTracks ?? [];
    });
    return {
      rounds,
      tracksPerRound,
      totalScore: computed(() => store.session()?.totalScore ?? 0),
      shownTracks,
      /** Une réponse est affichée (la carte à la place du lecteur et de la saisie). */
      answered: computed(() => store.revealed() !== null),
      /** Les points gagnés sur le morceau qui vient d'être répondu (« +67 »), vides tant que le joueur n'a pas répondu. */
      gain: computed(() => store.revealed()?.points ?? null),
      /** Les pastilles de la manche affichée : le morceau en cours est en corail tant que le joueur n'a pas répondu. */
      pills: computed<PillState[]>(() => trackPills(tracksPerRound(), shownTracks(), store.revealed() === null && store.current() !== null)),
      /** « Morceau n sur N » : le morceau en cours, ou celui dont la réponse est affichée. */
      positionInRound: computed(() => (store.revealed() ? shownTracks().length : (store.current()?.positionInRound ?? 0))),
      record: computed(() => store.me()?.record ?? null),
      hasPending: computed(() => store.me()?.pending != null),
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
      // Le serveur a neutralisé ce morceau (extrait introuvable) ou la partie est finie : l'écran suit la nouvelle situation, la manche
      // du morceau disparu garde son adresse (elle est remplacée).
      applyPlay(play);
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

    const startTrack = (current: RunCurrentTrack, session: RunSession) => {
      patchState(store, { revealed: null });
      round.start(configOf(current, session.listenSeconds), null);
    };

    /** La partie telle que le serveur la rend (lancement, reprise, extrait redemandé) : l'écran suit, le morceau à jouer démarre. */
    function applyPlay(play: RunPlay): void {
      round.reset();
      patchState(store, {
        session: play.session,
        current: play.current,
        shownRound: play.session.round,
        revealed: null,
        summaries: play.roundSummaries,
        neutralized: play.neutralized,
      });
      if (isFinished(play.session) || !play.current) {
        patchState(store, { screen: 'finished' });
        return;
      }
      patchState(store, { screen: 'playing' });
      startTrack(play.current, play.session);
    }

    const refreshMe = async (): Promise<void> => {
      try {
        patchState(store, { me: await api.me() });
      } catch {
        // l'accueil se contente de ce qu'il sait
      }
    };

    const applyOutcome = (outcome: StartOutcome) => {
      switch (outcome.kind) {
        case 'ok':
          applyPlay(outcome.play);
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

    /** Premier chargement, ou « Réessayer » d'un écran d'erreur : mon accès, mon record, ma partie en cours. */
    async function init(): Promise<void> {
      round.reset();
      patchState(store, { screen: 'loading', session: null, current: null, revealed: null, summaries: [], neutralized: [] });
      try {
        const me = await api.me();
        patchState(store, { me, screen: me.hasAccess ? 'welcome' : 'access_denied' });
      } catch {
        patchState(store, { screen: 'error' });
      }
    }

    return {
      init,
      /** « Lancer » ou « Reprendre » (un clic) : une partie neuve sur une playlist neuve, ou celle qui était en cours. */
      async begin(): Promise<void> {
        round.unlockAudio();
        const pending = store.me()?.pending ?? null;
        patchState(store, { screen: 'loading' });
        applyOutcome(await (pending ? api.join(pending.challengeCode) : api.launch()));
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
          const before = store.shownRound();
          const [summary] = play.roundSummaries;
          patchState(store, {
            session: play.session,
            current: play.current,
            // La dernière réponse d'une manche : la barre garde cette manche (score et objectif de son bilan), pas la suivante.
            shownRound: summary && before ? { ...before, score: summary.score, objective: summary.objective } : play.session.round,
            revealed: play.revealed,
            summaries: play.roundSummaries,
            neutralized: play.neutralized,
          });
          round.reveal();
        } catch {
          round.submissionFailed();
        }
      },
      /** « Morceau suivant » (un clic) : le morceau suivant, le bilan de la manche, ou la fin de la partie. */
      nextTrack(): void {
        round.unlockAudio();
        const session = store.session();
        if (!session) return;
        if (isFinished(session)) {
          round.reset();
          patchState(store, { screen: 'finished', revealed: null });
          void refreshMe();
          return;
        }
        if (store.summaries().length > 0) {
          round.reset();
          patchState(store, { screen: 'round_end', revealed: null });
          return;
        }
        const current = store.current();
        if (current) startTrack(current, session);
      },
      /** « Manche suivante » (un clic), depuis le bilan : le premier morceau de la manche débloquée. */
      nextRound(): void {
        round.unlockAudio();
        const session = store.session();
        const current = store.current();
        if (!session || !current) return;
        patchState(store, { screen: 'playing', summaries: [], shownRound: session.round });
        startTrack(current, session);
      },
      /** Abandonne la partie en cours : le serveur la ferme (elle ne compte pas pour le record), l'écran revient à l'accueil du mode. */
      async abandon(): Promise<void> {
        const sessionId = store.session()?.sessionId;
        if (sessionId === undefined) return;
        patchState(store, { abandonLoading: true });
        try {
          await api.abandon(sessionId);
          await init();
        } catch {
          // la partie reste en cours : le joueur peut réessayer
        } finally {
          patchState(store, { abandonLoading: false });
        }
      },
      /** « Nouvelle partie » depuis la fin : retour à l'accueil du mode, mon record à jour. */
      playAgain: (): Promise<void> => init(),
    };
  }),
);

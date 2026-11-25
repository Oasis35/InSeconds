import { computed, effect, inject, untracked } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { SessionLoader } from '../../account/data-access/session-loader';
import { RoundConfig, RoundSubmission } from '../../gameplay/domain/track-round';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { AnsweredTrack, DailySettings, ResumedTrack, StartedSession, TrackSlot } from '../domain/daily';
import { toRoundResult } from '../domain/round-result';
import { dailyStake } from '../domain/stake';
import { DailyApi } from './daily.api';
import { HomeStore } from './home.store';

/** Où mène la fin d'une étape de la manche : la partie continue ici, ou on rend la main à l'accueil. */
export type RoundExit = 'playing' | 'home';

interface RoundState {
  /** `starting` : la partie se crée (écran de chargement) ; `playing` : une manche est en cours ; `ended` : plus rien à jouer ici. */
  phase: 'starting' | 'playing' | 'ended';
  settings: DailySettings | null;
  sessionId: number;
  tracks: readonly TrackSlot[];
  /** Les morceaux répondus de la partie (ceux de la reprise compris), dans l'ordre. */
  results: readonly AnsweredTrack[];
  /** Position du morceau en cours (1 pour le premier) ; 0 tant qu'aucune partie n'est lancée. */
  position: number;
  abandonLoading: boolean;
  hintPending: boolean;
}

const initialState: RoundState = {
  phase: 'starting',
  settings: null,
  sessionId: 0,
  tracks: [],
  results: [],
  position: 0,
  abandonLoading: false,
  hintPending: false,
};

/**
 * La partie du jour en cours, sur `/daily` : la création (ou la reprise) de la partie, le morceau en cours, les réponses, les indices, la fin.
 * À fournir à la page de la manche (avec `TrackRoundStore`, qu'il pilote) : la route fournit aussi le lecteur (`provideGameplay()`). L'accueil
 * (`HomeStore`) n'en sait rien : la manche lui rend sa fin (`finishGame`, `enterAlreadyPlayed`, `fail`) et il lit le résultat chez lui.
 *
 * **Le son ne démarre que sur un clic** : le clic sur « Commencer » / « Reprendre » de l'accueil déverrouille l'élément audio avant d'ouvrir
 * la manche, `nextTrack()` déverrouille dans le sien ; jamais l'arrivée sur la route, un `effect` ni le retour de l'onglet.
 */
export const DailyRoundStore = signalStore(
  withState<RoundState>(initialState),
  withComputed(store => {
    const trackCount = computed(() => store.tracks().length);
    return {
      trackCount,
      totalScore: computed(() => store.results().reduce((sum, r) => sum + r.score, 0)),
      currentIndex: computed(() => Math.max(0, store.position() - 1)),
      isLastTrack: computed(() => trackCount() > 0 && store.position() === trackCount()),
      isPlaying: computed(() => store.phase() === 'playing'),
      /** Ce que la carte de révélation montre du morceau en cours, une fois la réponse du serveur reçue. */
      roundResult: computed(() => {
        const answered = store.results().find(r => r.position === store.position());
        return answered ? toRoundResult(answered) : null;
      }),
      roundScore: computed(() => store.results().find(r => r.position === store.position())?.score ?? 0),
      roundDeezerTrackId: computed(() => store.results().find(r => r.position === store.position())?.deezerTrackId ?? null),
    };
  }),
  withMethods((store, api = inject(DailyApi), round = inject(TrackRoundStore), sessionLoader = inject(SessionLoader), home = inject(HomeStore)) => {
    /** Les écoutes envoyées au serveur se suivent : une demande d'indice attend la dernière (sinon le serveur refuse, 409). */
    let listeningQueue: Promise<void> = Promise.resolve();
    const sentListening = new Map<number, number>();

    /**
     * Redemande l'extrait d'un morceau à une adresse fraîche (la signature Deezer expire, piège 14) : la reprise de la partie en donne
     * de neuves. `null` : Deezer n'a plus d'extrait pour ce morceau (retiré en cours de journée). Une partie qui ne se reprend plus
     * (finie ailleurs) est un échec : la manche garde son adresse.
     */
    const refreshPreview = async (position: number): Promise<string | null> => {
      const outcome = await api.start();
      if (outcome.kind !== 'ok') throw new Error(`daily.refresh_preview: ${outcome.kind}`);
      patchState(store, { tracks: outcome.session.tracks });
      return outcome.session.tracks.find(t => t.position === position)?.previewUrl || null;
    };

    const configOf = (position: number, settings: DailySettings, resumed: ResumedTrack | null): RoundConfig => ({
      trackId: position,
      previewUrl: store.tracks().find(t => t.position === position)?.previewUrl || null,
      waveform: store.tracks().find(t => t.position === position)?.waveform ?? null,
      listen: { steps: settings.allowedDurationsSeconds, extendable: true, stake: (seconds, hintLevel) => dailyStake(settings, seconds, hintLevel) },
      hints: { unlockSeconds: settings.hints.map(h => h.unlockSeconds), kinds: settings.hints.map(h => h.kind) },
      // Reprise : le plancher d'écoute et les indices déjà payés du morceau en cours.
      listenedFloor: resumed && resumed.listenedSeconds > 0 ? resumed.listenedSeconds : null,
      hintLevel: resumed?.hintLevel ?? 0,
      hintFacts: resumed?.hintFacts ?? [],
      refreshPreviewUrl: () => refreshPreview(position),
    });

    /** Lance la manche d'un morceau. Appelé après un clic du joueur, jamais autrement. */
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
        phase: 'playing',
      });
      startTrack(session.nextPosition, session.currentTrack?.position === session.nextPosition ? session.currentTrack : null);
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

    /** La partie est finie ou abandonnée ailleurs, ou ici : plus rien à jouer, la manche et son son s'arrêtent. */
    const end = () => {
      round.reset();
      patchState(store, { phase: 'ended' });
    };

    /** La page est détruite (retour pendant l'ouverture) : plus rien ne doit démarrer ni sonner. */
    let disposed = false;

    return {
      /** Appelé à la destruction de la page : un `begin()` en vol s'arrête avant de lancer un morceau. */
      dispose(): void {
        disposed = true;
      },

      /**
       * Arrivée sur la manche après le clic de l'accueil : crée (ou reprend) la partie, puis lance le premier morceau. `home` : rien
       * à jouer ici (déjà jouée ailleurs, pas de défi, échec), l'accueil le dit et la page y retourne.
       */
      async begin(): Promise<RoundExit> {
        // Déjà déverrouillé par le clic de l'accueil (sans effet) ; sinon un essai de plus, qui ne coûte rien.
        round.unlockAudio();
        patchState(store, { phase: 'starting' });
        await sessionLoader.ensureGuest();
        const settings = await ensureSettings();
        if (disposed) return 'home';
        if (!settings) {
          patchState(store, { phase: 'ended' });
          home.fail('error');
          return 'home';
        }
        const outcome = await api.start();
        switch (outcome.kind) {
          case 'ok':
            home.roundStarted(outcome.session.streak);
            if (disposed) {
              // Le joueur est déjà revenu à l'accueil : la partie existe, l'accueil la relit (tuile de reprise), aucun son.
              void home.init();
              return 'home';
            }
            applySession(outcome.session);
            return 'playing';
          case 'already_played':
            end();
            home.enterAlreadyPlayed(outcome.abandoned);
            return 'home';
          case 'no_challenge':
            patchState(store, { phase: 'ended' });
            home.fail('no_challenge');
            return 'home';
          default:
            patchState(store, { phase: 'ended' });
            home.fail('error');
            return 'home';
        }
      },

      /**
       * Retour de l'onglet au premier plan en pleine partie : relit l'état du jour. Une partie finie ou abandonnée ailleurs arrête la manche
       * (`home` : l'accueil montre « déjà joué ») ; jamais de retour à l'accueil pour une partie qui continue.
       */
      async refresh(): Promise<RoundExit> {
        if (store.phase() !== 'playing') return 'playing';
        let today;
        try {
          today = await api.today();
        } catch {
          return 'playing';
        }
        if (store.phase() !== 'playing') return 'playing';
        // Dernier morceau répondu : le serveur dit déjà « déjà joué », mais le joueur doit encore passer par le récap.
        const lastAnswered = store.tracks().length > 0 && store.results().length >= store.tracks().length;
        if (lastAnswered) {
          home.setToday(today);
          return 'playing';
        }
        if (today.state !== 'already_played' && today.state !== 'abandoned') {
          home.setToday(today);
          return 'playing';
        }
        end();
        home.setToday(today);
        home.enterAlreadyPlayed(today.state === 'abandoned');
        return 'home';
      },

      /** Abandonne la partie en cours : l'accueil montre « déjà joué ». `true` si c'est fait (la page retourne à l'accueil). */
      async abandon(): Promise<boolean> {
        patchState(store, { abandonLoading: true });
        try {
          await api.abandon(store.sessionId());
          end();
          home.enterAlreadyPlayed(true);
          return true;
        } catch {
          // la partie reste en cours : le joueur peut réessayer
          return false;
        } finally {
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

      /**
       * « Piste suivante » (un clic) : le morceau suivant, ou la fin de partie après le dernier (`home` : le résultat se lit sur l'accueil,
       * que la page rejoint).
       */
      nextTrack(): RoundExit {
        round.unlockAudio();
        if (!store.isLastTrack()) {
          startTrack(store.position() + 1, null);
          return 'playing';
        }
        const results = store.results();
        const trackCount = store.trackCount();
        end();
        home.finishGame(results, trackCount);
        return 'home';
      },

      /** Suit le palier choisi de la manche (appelé par le hook ci-dessous, jamais par un composant). */
      syncListening(position: number, seconds: number): void {
        if (store.phase() !== 'playing' || store.sessionId() === 0 || position < 1 || seconds <= (sentListening.get(position) ?? 0)) return;
        reportListening(position, seconds);
      },
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
  }),
);

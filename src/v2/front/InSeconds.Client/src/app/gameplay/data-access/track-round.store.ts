import { DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { patchState, signalStore, signalStoreFeature, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import {
  HintFact, RoundAnswer, RoundConfig, RoundSubmission, TrackRound, applyHints, askSkip, availableHintLevels, beginListening,
  cancelConfirm, confirmPending, createRound, listenMore, maxStep, nextStep, onAudio, replacePreviewUrl, retryPlayback, retrySubmission, reveal,
  showsInput, skipUnplayable, submissionFailed, submitAnswer,
} from '../domain/track-round';
import { AudioPort } from './audio.port';

interface TrackRoundState {
  round: TrackRound | null;
}

/**
 * La manche d'un morceau (§ 6.2 et § 6.3 du plan v2), à composer dans le store d'un mode, ou à fournir tel quel (`TrackRoundStore`) à côté de lui, ce que `TrackRoundComponent` injecte : l'état est
 * celui de la machine à états de `domain/`, les méthodes en sont les transitions, et le store
 * donne ses ordres au lecteur (`AudioPort`). Il ne connaît ni le mode, ni le réseau :
 * - le mode appelle `start(...)` avec ses paliers et ses indices ;
 * - quand le joueur répond, `submit()` rend ce qu'il faut envoyer (`RoundSubmission`) ; le mode
 *   l'envoie puis appelle `reveal()` ou `submissionFailed()` ;
 * - un indice demandé est fourni par le back : le mode appelle `applyHints(...)`.
 */
export function withTrackRound() {
  return signalStoreFeature(
    withState<TrackRoundState>({ round: null }),
    withComputed(({ round }, audio = inject(AudioPort)) => ({
      trackId: computed(() => round()?.trackId ?? null),
      phase: computed(() => round()?.phase ?? null),
      chosenSeconds: computed(() => round()?.chosenSeconds ?? 0),
      steps: computed(() => round()?.steps ?? []),
      maxStep: computed(() => { const r = round(); return r ? maxStep(r) : 0; }),
      nextStep: computed(() => { const r = round(); return r ? nextStep(r) : null; }),
      wasExtended: computed(() => round()?.extended ?? false),
      showsInput: computed(() => { const r = round(); return r ? showsInput(r) : false; }),
      hintLevel: computed(() => round()?.hintLevel ?? 0),
      hints: computed<readonly HintFact[]>(() => round()?.hints ?? []),
      /** Ce que révèle chaque niveau, quand le back le dit (libellé des boutons). */
      hintKinds: computed<readonly (string | null)[]>(() => round()?.hintKinds ?? []),
      availableHintLevels: computed(() => { const r = round(); return r ? availableHintLevels(r) : []; }),
      pendingConfirm: computed(() => round()?.confirm ?? null),
      submission: computed(() => round()?.submission ?? null),
      /** La position de lecture, en secondes (pour la barre de progression). */
      position: computed(() => audio.position()),
    })),
    withMethods((store, audio = inject(AudioPort)) => {
      /** L'extrait suivant, chargé en arrière-plan : le seul autre son gardé en mémoire. */
      let nextPreviewUrl: string | null = null;
      /** Le mode qui sait redemander une adresse d'extrait (signature expirée), pour « Réessayer ». */
      let refreshPreviewUrl: RoundConfig['refreshPreviewUrl'];

      const set = (round: TrackRound | null) => patchState(store, { round });
      /** Applique une transition ; rend la manche avant et après si elle a changé. */
      const apply = (transition: (round: TrackRound) => TrackRound): { before: TrackRound; after: TrackRound } | null => {
        const before = store.round();
        if (!before) return null;
        const after = transition(before);
        if (after === before) return null;
        set(after);
        return { before, after };
      };
      const launch = (round: TrackRound) => {
        audio.load(round.previewUrl!, nextPreviewUrl);
        audio.playUntil(round.chosenSeconds);
      };
      /** La réponse part : on rend ce que le mode doit envoyer. */
      const submissionOf = (changed: { after: TrackRound } | null): RoundSubmission | null =>
        changed?.after.phase === 'submitting' ? changed.after.submission : null;

      return {
        /** Démarre la manche d'un morceau ; l'écoute commence toute seule, au premier palier permis. */
        start(config: RoundConfig, nextUrl: string | null = null): void {
          audio.stop();
          nextPreviewUrl = nextUrl;
          refreshPreviewUrl = config.refreshPreviewUrl;
          const created = createRound(config);
          const started = beginListening(created);
          set(started);
          if (started !== created) launch(started);
        },

        /**
         * Déverrouille le son : le mode l'appelle dans le gestionnaire du clic qui lancera la manche,
         * avant ses appels réseau (sur iPhone, un son lancé hors du geste reste muet).
         */
        unlockAudio(): void {
          audio.unlock();
        },

        /** « Écouter plus » : le palier suivant, pendant le chargement ou l'écoute comme après. */
        listenMore(): void {
          const changed = apply(listenMore);
          if (!changed) return;
          audio.playUntil(changed.after.chosenSeconds);
          // Un lecteur qui ne change pas d'état (extrait déjà joué jusqu'au bout : il reste `finished`)
          // ne réveille pas l'effet : la manche se recale sur lui, sinon elle resterait « en lecture ».
          apply(round => onAudio(round, audio.state()));
        },

        /** ↺ : rejoue le palier en cours depuis le début, sans toucher à `wasExtended` (piège 40). */
        replay(): void {
          const round = store.round();
          if (round && (round.phase === 'playing' || round.phase === 'listened')) audio.replay(round.chosenSeconds);
        },

        /**
         * « Réessayer » après un échec de lecture : recharge l'extrait et repart au palier choisi. Si
         * le mode sait redemander l'adresse (`refreshPreviewUrl`), l'extrait est rechargé depuis une
         * adresse fraîche (piège 14) ; sinon depuis la même.
         */
        retryPlayback(): void {
          const changed = apply(retryPlayback);
          if (!changed) return;
          const refresh = refreshPreviewUrl;
          if (!refresh) {
            launch(changed.after);
            return;
          }
          const trackId = changed.after.trackId;
          void refresh().catch(() => null).then(url => {
            const round = store.round();
            // le joueur est passé à autre chose entre-temps (passé le morceau, morceau suivant)
            if (round?.trackId !== trackId || round.phase !== 'loading') return;
            const fresh = url ? replacePreviewUrl(round, url) : round;
            set(fresh);
            launch(fresh);
          });
        },

        askSkip: (): void => {
          apply(askSkip);
        },
        cancelConfirm: (): void => {
          apply(cancelConfirm);
        },

        /** Valide la saisie ; une saisie vide demande confirmation (`pendingConfirm`) et ne rend rien. */
        submit: (answer: RoundAnswer): RoundSubmission | null => submissionOf(apply(round => submitAnswer(round, answer))),

        /** Confirme « Passer » ou la réponse vide. */
        confirm: (answer: RoundAnswer): RoundSubmission | null => submissionOf(apply(round => confirmPending(round, answer))),

        /** Passe un morceau sans extrait ou dont la lecture a échoué, sans confirmation. */
        skipUnplayable: (): RoundSubmission | null => submissionOf(apply(skipUnplayable)),

        submissionFailed: (): void => {
          apply(submissionFailed);
        },

        /** « Réessayer » après un échec d'envoi : la même réponse repart. */
        retrySubmission: (): RoundSubmission | null => submissionOf(apply(retrySubmission)),

        /** Le serveur a répondu : la réponse est révélée, et l'extrait se rejoue en entier. */
        reveal(): void {
          const round = apply(reveal)?.after;
          if (round?.previewUrl && round.chosenSeconds > 0 && audio.state() !== 'error') audio.playFull();
        },

        /** Le back a révélé jusqu'à ce niveau, avec ces indices cumulés. */
        applyHints: (level: number, facts: readonly HintFact[]): void => {
          apply(round => applyHints(round, level, facts));
        },

        /** Fin de la manche : coupe le son et oublie le morceau. */
        reset(): void {
          audio.stop();
          nextPreviewUrl = null;
          set(null);
        },
      };
    }),
    withHooks({
      onInit(store) {
        const audio = inject(AudioPort);
        // Le store disparu, plus personne n'écoute : le son s'arrête.
        inject(DestroyRef).onDestroy(() => audio.stop());
        // Le lecteur parle, la manche suit (chargement, lecture, palier joué, erreur).
        effect(() => {
          const state = audio.state();
          untracked(() => {
            const round = store.round();
            if (round) patchState(store, { round: onAudio(round, state) });
          });
        });
      },
    }),
  );
}

/** Le store de la manche, pour une page qui n'en a pas besoin d'autre (un mode compose `withTrackRound()` lui-même). */
export const TrackRoundStore = signalStore(withTrackRound());

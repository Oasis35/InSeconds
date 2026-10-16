import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { AppError, toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import {
  ChallengeHistoryEntry, ChallengeStats, availableMonths, inMonth, resolveMonth, shiftMonth,
} from '../domain/challenge';
import { AdminCounts } from './admin-counts';
import { ChallengesApi } from './challenges.api';

const COPIED_VISIBLE_MS = 1500;

interface ChallengesState {
  stats: readonly ChallengeStats[];
  history: readonly ChallengeHistoryEntry[];
  /** Le mois choisi avec ‹ ›, ou `null` : le mois affiché est alors celui que `resolveMonth` retient. */
  requestedMonth: string | null;
  expandedIds: readonly number[];
  highlightedPlayerId: string | null;
  /** Le joueur dont l'identifiant vient d'être copié (« Copié ! » pendant un instant). */
  copiedPlayerId: string | null;
  /** Les jours dont le recalcul est en cours. */
  recomputingDays: readonly string[];
  /** L'erreur du dernier recalcul de chaque jour (retirée au recalcul suivant). */
  recomputeErrors: Readonly<Record<string, AppError>>;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * L'onglet Défis : les stats des 30 derniers défis et l'historique de tous les défis, rangés par mois
 * (un seul navigateur de mois pour les deux), les défis dépliés, le joueur mis en surbrillance, et le
 * recalcul des stats d'un jour fini. Les deux lectures partent ensemble à l'ouverture de l'onglet.
 */
export const ChallengesStore = signalStore(
  withRequestStatus(),
  withState<ChallengesState>({
    stats: [], history: [], requestedMonth: null, expandedIds: [], highlightedPlayerId: null, copiedPlayerId: null,
    recomputingDays: [], recomputeErrors: {},
  }),
  withComputed(({ stats, history, requestedMonth }) => {
    const months = computed(() => availableMonths(stats(), history()));
    const month = computed(() => resolveMonth(requestedMonth(), months(), currentMonth()));
    return {
      months,
      month,
      statsForMonth: computed(() => inMonth(stats(), month())),
      historyForMonth: computed(() => inMonth(history(), month())),
      canGoPrevious: computed(() => shiftMonth(months(), month(), -1) !== month()),
      canGoNext: computed(() => shiftMonth(months(), month(), 1) !== month()),
    };
  }),
  withMethods((store, api = inject(ChallengesApi), counts = inject(AdminCounts), clipboard = inject(ClipboardService)) => {
    let latestLoad = 0;
    let copiedTimer: ReturnType<typeof setTimeout> | null = null;

    const withoutError = (day: string) =>
      Object.fromEntries(Object.entries(store.recomputeErrors()).filter(([key]) => key !== day));

    return {
      /** Lit les stats et l'historique ; une réponse plus ancienne, arrivée après une plus récente, n'écrit rien. */
      async load(): Promise<void> {
        const mine = ++latestLoad;
        patchState(store, setPending());
        try {
          const [stats, history] = await Promise.all([api.loadStats(), api.listHistory()]);
          if (mine !== latestLoad) return;
          counts.setChallenges(stats.length);
          patchState(store, { stats, history }, setFulfilled());
        } catch (error) {
          const appError = await toAppError(error);
          if (mine === latestLoad) patchState(store, setError(appError));
        }
      },

      /** `+1` : mois plus récent, `-1` : plus ancien. Le joueur surligné est lâché (il n'a peut-être pas joué ce mois-là). */
      shiftMonth(delta: 1 | -1): void {
        patchState(store, { requestedMonth: shiftMonth(store.months(), store.month(), delta), highlightedPlayerId: null });
      },

      toggleExpanded(id: number): void {
        const open = store.expandedIds();
        patchState(store, { expandedIds: open.includes(id) ? open.filter(x => x !== id) : [...open, id] });
      },

      /** Surligne le joueur sur tous les défis ; un second clic (ou un autre joueur) bascule. */
      toggleHighlight(playerId: string): void {
        patchState(store, { highlightedPlayerId: store.highlightedPlayerId() === playerId ? null : playerId });
      },

      /** Copie l'identifiant complet et affiche « Copié ! » un instant ; rien si la copie échoue. */
      async copyPlayerId(playerId: string): Promise<void> {
        if (!(await clipboard.copy(playerId))) return;
        if (copiedTimer !== null) clearTimeout(copiedTimer);
        patchState(store, { copiedPlayerId: playerId });
        copiedTimer = setTimeout(() => {
          copiedTimer = null;
          if (store.copiedPlayerId() === playerId) patchState(store, { copiedPlayerId: null });
        }, COPIED_VISIBLE_MS);
      },

      /** Recalcule les stats d'un jour fini : le défi de la liste est remplacé par la réponse. */
      async recompute(day: string): Promise<void> {
        if (store.recomputingDays().includes(day)) return;
        patchState(store, { recomputingDays: [...store.recomputingDays(), day], recomputeErrors: withoutError(day) });
        try {
          const recomputed = await api.recompute(day);
          patchState(store, { stats: store.stats().map(c => (c.id === recomputed.id ? recomputed : c)) });
        } catch (error) {
          const appError = await toAppError(error);
          patchState(store, { recomputeErrors: { ...store.recomputeErrors(), [day]: appError } });
        } finally {
          patchState(store, { recomputingDays: store.recomputingDays().filter(d => d !== day) });
        }
      },
    };
  }),
);

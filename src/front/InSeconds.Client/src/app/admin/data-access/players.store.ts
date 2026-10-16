import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { PlayerGame, RegisteredPlayer, filterPlayers } from '../domain/registered-player';
import { AdminCounts } from './admin-counts';
import { AdminPlayersApi } from './players.api';

export type HistoryStatus = 'idle' | 'loading' | 'error';

interface PlayersState {
  players: readonly RegisteredPlayer[];
  filter: string;
  /** Ligne dépliée (une seule à la fois). */
  expandedId: string | null;
  /** Dernier historique lu par joueur : reste affiché pendant un rechargement et si celui-ci échoue. */
  histories: Readonly<Record<string, readonly PlayerGame[]>>;
  /** État de la lecture de l'historique du joueur déplié. */
  historyStatus: HistoryStatus;
}

/**
 * L'onglet Joueurs : comptes inscrits (lus à l'ouverture), filtre texte, ligne dépliée et son
 * historique, relu à chaque dépliage (une partie a pu être jouée entre-temps).
 */
export const AdminPlayersStore = signalStore(
  withRequestStatus(),
  withState<PlayersState>({ players: [], filter: '', expandedId: null, histories: {}, historyStatus: 'idle' }),
  withComputed(({ players, filter, expandedId, histories, historyStatus }) => ({
    filteredPlayers: computed(() => filterPlayers(players(), filter())),
    /** Historique à montrer pour la ligne dépliée : les parties connues (ou `null`) et l'état de la lecture. */
    expandedHistory: computed(() => {
      const id = expandedId();
      return id === null ? null : { games: histories()[id] ?? null, status: historyStatus() };
    }),
  })),
  withMethods((store, api = inject(AdminPlayersApi), counts = inject(AdminCounts)) => {
    let latestLoad = 0;
    let latestHistory = 0;

    return {
      async load(): Promise<void> {
        const mine = ++latestLoad;
        patchState(store, setPending());
        try {
          const players = await api.list();
          if (mine !== latestLoad) return;
          counts.setPlayers(players.length);
          patchState(store, { players }, setFulfilled());
        } catch (error) {
          const appError = await toAppError(error);
          if (mine === latestLoad) patchState(store, setError(appError));
        }
      },

      setFilter: (filter: string) => patchState(store, { filter }),

      /** Déplie la ligne (et relit son historique), ou la replie si elle l'était. */
      async toggle(playerId: string): Promise<void> {
        if (store.expandedId() === playerId) {
          latestHistory++;
          patchState(store, { expandedId: null, historyStatus: 'idle' });
          return;
        }
        const mine = ++latestHistory;
        patchState(store, { expandedId: playerId, historyStatus: 'loading' });
        try {
          const games = await api.history(playerId);
          if (mine !== latestHistory) return;
          patchState(store, { histories: { ...store.histories(), [playerId]: games }, historyStatus: 'idle' });
        } catch {
          if (mine === latestHistory) patchState(store, { historyStatus: 'error' });
        }
      },
    };
  }),
);

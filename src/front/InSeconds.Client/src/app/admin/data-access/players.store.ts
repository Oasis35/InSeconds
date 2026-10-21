import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { AppError, toAppError } from '../../core/errors/app-error';
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
  /** Les comptes autorisés à lancer un run (hors admins, qui l'ont d'office). */
  runAccess: readonly string[];
  /** Les comptes dont l'interrupteur attend la réponse de l'API. */
  runAccessPending: readonly string[];
  /** Le dernier changement d'accès refusé par l'API (l'interrupteur revient à son état d'avant). */
  runAccessError: AppError | null;
}

/**
 * L'onglet Joueurs : comptes inscrits (lus à l'ouverture avec la liste des accès au mode Run, une lecture pour tous les
 * interrupteurs), filtre texte, ligne dépliée et son historique, relu à chaque dépliage (une partie a pu être jouée entre-temps).
 */
export const AdminPlayersStore = signalStore(
  withRequestStatus(),
  withState<PlayersState>({
    players: [], filter: '', expandedId: null, histories: {}, historyStatus: 'idle', runAccess: [], runAccessPending: [], runAccessError: null,
  }),
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
          const [players, runAccess] = await Promise.all([api.list(), api.listRunAccess()]);
          if (mine !== latestLoad) return;
          counts.setPlayers(players.length);
          patchState(store, { players, runAccess, runAccessError: null }, setFulfilled());
        } catch (error) {
          const appError = await toAppError(error);
          if (mine === latestLoad) patchState(store, setError(appError));
        }
      },

      setFilter: (filter: string) => patchState(store, { filter }),

      /** Autorise (ou retire) l'accès au mode Run d'un compte. L'état affiché ne change qu'une fois l'API d'accord ; un refus se lit dans `runAccessError`. */
      async setRunAccess(playerId: string, enabled: boolean): Promise<void> {
        if (store.runAccessPending().includes(playerId)) return;
        patchState(store, { runAccessPending: [...store.runAccessPending(), playerId], runAccessError: null });
        try {
          await api.setRunAccess(playerId, enabled);
          const others = store.runAccess().filter(id => id !== playerId);
          patchState(store, { runAccess: enabled ? [...others, playerId] : others });
        } catch (error) {
          patchState(store, { runAccessError: await toAppError(error) });
        } finally {
          patchState(store, { runAccessPending: store.runAccessPending().filter(id => id !== playerId) });
        }
      },

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

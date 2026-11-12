import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { DifficultyFilter, RunHistory, filterRuns } from '../domain/run-history';
import { RunsApi } from './runs.api';

interface RunHistoryState {
  status: 'loading' | 'ready' | 'error';
  history: RunHistory | null;
  filter: DifficultyFilter;
}

/** L'historique du joueur sur le mode Setlist, un mois à la fois, filtré par difficulté. À fournir à la page. */
export const RunHistoryStore = signalStore(
  withState<RunHistoryState>({ status: 'loading', history: null, filter: 'all' }),
  withComputed(store => ({
    /** Les setlists du mois à la difficulté choisie. */
    visibleRuns: computed(() => filterRuns(store.history()?.runs ?? [], store.filter())),
  })),
  withMethods((store, api = inject(RunsApi)) => {
    let request = 0;
    return {
      /** Lit un mois (`aaaa-mm` ; `null` : le mois en cours). Une réponse dépassée par une demande plus récente est ignorée. */
      async load(month: string | null): Promise<void> {
        const id = ++request;
        patchState(store, { status: 'loading' });
        try {
          const history = await api.history(month);
          if (id === request) patchState(store, { status: 'ready', history });
        } catch {
          if (id === request) patchState(store, { status: 'error' });
        }
      },

      chooseFilter(filter: DifficultyFilter): void {
        patchState(store, { filter });
      },
    };
  }),
);

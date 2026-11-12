import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { DailyHistory } from '../domain/history';
import { DailyApi } from './daily.api';

interface DailyHistoryState {
  status: 'loading' | 'ready' | 'error';
  history: DailyHistory | null;
}

/** L'historique du joueur sur le défi du jour, un mois à la fois. À fournir à la page. */
export const DailyHistoryStore = signalStore(
  withState<DailyHistoryState>({ status: 'loading', history: null }),
  withMethods((store, api = inject(DailyApi)) => {
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
    };
  }),
);

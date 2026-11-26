import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { DEFAULT_STATS_PERIOD, Stats } from '../domain/stats';
import { StatsApi } from './stats.api';

interface StatsState {
  stats: Stats | null;
  /** La période demandée, en jours. */
  period: number;
}

/** L'onglet Stats : une période (7, 30 ou 90 jours) et les chiffres qui vont avec ; l'ancien affichage reste pendant la relecture. */
export const StatsStore = signalStore(
  withRequestStatus(),
  withState<StatsState>({ stats: null, period: DEFAULT_STATS_PERIOD }),
  withMethods((store, api = inject(StatsApi)) => {
    /** Une réponse plus ancienne, arrivée après la plus récente, n'écrit rien. */
    let latest = 0;

    async function load(period: number): Promise<void> {
      const mine = ++latest;
      patchState(store, { period }, setPending());
      try {
        const stats = await api.getStats(period);
        if (mine === latest) patchState(store, { stats }, setFulfilled());
      } catch (error) {
        const appError = await toAppError(error);
        if (mine === latest) patchState(store, setError(appError));
      }
    }

    return {
      load,
      async selectPeriod(period: number): Promise<void> {
        if (period !== store.period()) await load(period);
      },
    };
  }),
);

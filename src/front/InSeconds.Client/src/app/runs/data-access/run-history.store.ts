import { inject } from '@angular/core';
import { signalStore } from '@ngrx/signals';
import { withMonthHistory } from '../../core/store/with-month-history';
import { RunHistory } from '../domain/run-history';
import { RunsApi } from './runs.api';

/** L'historique du joueur sur le mode Setlist, un mois à la fois. À fournir à la page. */
export const RunHistoryStore = signalStore(
  withMonthHistory<RunHistory>(() => {
    const api = inject(RunsApi);
    return month => api.history(month);
  }),
);

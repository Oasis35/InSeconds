import { inject } from '@angular/core';
import { signalStore } from '@ngrx/signals';
import { withMonthHistory } from '../../core/store/with-month-history';
import { DailyHistory } from '../domain/history';
import { DailyApi } from './daily.api';

/** L'historique du joueur sur le défi du jour, un mois à la fois. À fournir à la page. */
export const DailyHistoryStore = signalStore(
  withMonthHistory<DailyHistory>(() => {
    const api = inject(DailyApi);
    return month => api.history(month);
  }),
);

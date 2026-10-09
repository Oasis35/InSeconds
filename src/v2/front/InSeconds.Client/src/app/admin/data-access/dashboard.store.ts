import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import {
  Dashboard, Day, canGoToNextDay, canGoToPreviousDay, maxDailyPlayers, shiftDay, todayUtc, totalPlayers,
} from '../domain/dashboard';
import { DashboardApi } from './dashboard.api';

interface DashboardState {
  dashboard: Dashboard | null;
  /** Le jour affiché : celui qu'on a demandé, sinon celui que l'API a rendu, sinon aujourd'hui. */
  selectedDay: Day | null;
}

/**
 * Le tableau de bord de l'admin : un jour sélectionné et les chiffres qui vont avec. Changer de jour
 * relit le tableau de bord (`?date=`) ; pendant la lecture, l'ancien affichage reste en place.
 */
export const DashboardStore = signalStore(
  withRequestStatus(),
  withState<DashboardState>({ dashboard: null, selectedDay: null }),
  withComputed(({ dashboard, selectedDay }) => ({
    totalPlayers: computed(() => totalPlayers(dashboard()?.activity ?? [])),
    maxDailyPlayers: computed(() => maxDailyPlayers(dashboard()?.activity ?? [])),
    canGoToPreviousDay: computed(() => canGoToPreviousDay(dashboard()?.availableDays ?? [], selectedDay())),
    canGoToNextDay: computed(() => canGoToNextDay(dashboard()?.availableDays ?? [], selectedDay())),
    isSelectedDayToday: computed(() => selectedDay() === todayUtc(new Date())),
  })),
  withMethods((store, api = inject(DashboardApi)) => {
    /** Numéro de la lecture la plus récente : une réponse plus ancienne, arrivée après elle, n'écrit rien. */
    let latestLoad = 0;

    async function load(day?: Day): Promise<void> {
      const mine = ++latestLoad;
      patchState(store, setPending());
      try {
        const dashboard = await api.getDashboard(day);
        if (mine !== latestLoad) return;
        const selectedDay = day ?? dashboard.kpis?.day ?? todayUtc(new Date());
        patchState(store, { dashboard, selectedDay }, setFulfilled());
      } catch (error) {
        const appError = await toAppError(error);
        if (mine === latestLoad) patchState(store, setError(appError));
      }
    }

    return {
      load,

      async selectDay(day: Day): Promise<void> {
        if (day === store.selectedDay()) return;
        await load(day);
      },

      /** Jour voisin : `delta` > 0 vers le futur, < 0 vers le passé. Sans effet au bout de la liste. */
      async shiftDay(delta: number): Promise<void> {
        const next = shiftDay(store.dashboard()?.availableDays ?? [], store.selectedDay(), delta);
        if (next !== null) await load(next);
      },
    };
  }),
);

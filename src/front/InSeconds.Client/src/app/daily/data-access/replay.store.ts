import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { ReplayDay, ReplayFilter, appendDays } from '../domain/replay';
import { DailyApi } from './daily.api';

interface ReplayState {
  status: 'loading' | 'ready' | 'error';
  /** La suite est en cours de lecture. */
  moreStatus: 'idle' | 'loading' | 'error';
  filter: ReplayFilter;
  days: readonly ReplayDay[];
  nextBefore: string | null;
  allCount: number;
  noneCount: number;
  halfCount: number;
}

/** « À réécouter » : les morceaux ratés du joueur, une page à la fois, par filtre. À fournir à la page. */
export const ReplayStore = signalStore(
  withState<ReplayState>({ status: 'loading', moreStatus: 'idle', filter: 'all', days: [], nextBefore: null, allCount: 0, noneCount: 0, halfCount: 0 }),
  withMethods((store, api = inject(DailyApi)) => {
    let latest = 0;
    return {
      /** Relit la première page de ce filtre. Une réponse dépassée par une demande plus récente est ignorée. */
      async load(filter: ReplayFilter): Promise<void> {
        const id = ++latest;
        patchState(store, { status: 'loading', moreStatus: 'idle', filter });
        try {
          const page = await api.replay(filter, null);
          if (id !== latest) return;
          patchState(store, { status: 'ready', ...page });
        } catch {
          if (id === latest) patchState(store, { status: 'error' });
        }
      },

      /** Ajoute la page suivante ; sans suite, rien. */
      async loadMore(): Promise<void> {
        const before = store.nextBefore();
        if (before === null || store.moreStatus() === 'loading') return;
        const id = latest;
        patchState(store, { moreStatus: 'loading' });
        try {
          const page = await api.replay(store.filter(), before);
          if (id !== latest) return;
          patchState(store, { moreStatus: 'idle', days: appendDays(store.days(), page.days), nextBefore: page.nextBefore });
        } catch {
          if (id === latest) patchState(store, { moreStatus: 'error' });
        }
      },

      /** Une adresse neuve pour l'extrait d'un morceau d'un jour passé (piège 14) ; `null` en cas d'échec. */
      async previewUrl(date: string, position: number): Promise<string | null> {
        try {
          return await api.archivePreviewUrl(date, position);
        } catch {
          return null;
        }
      },
    };
  }),
);

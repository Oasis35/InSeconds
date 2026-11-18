import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { GeneralRanking } from '../domain/group';
import { SocialApi } from './social.api';

interface GeneralRankingState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  ranking: GeneralRanking | null;
  /** Le choix du nom est en cours d'envoi. */
  saving: boolean;
  /** Le dernier changement de nom a été refusé. */
  saveFailed: boolean;
}

/** Le classement général et le nom sous lequel on y apparaît. À fournir à l'écran qui l'affiche. */
export const GeneralRankingStore = signalStore(
  withState<GeneralRankingState>({ status: 'idle', ranking: null, saving: false, saveFailed: false }),
  withMethods((store, api = inject(SocialApi)) => {
    async function save(change: () => Promise<unknown>): Promise<void> {
      if (store.saving()) return;
      patchState(store, { saving: true, saveFailed: false });
      try {
        await change();
        patchState(store, { ranking: await api.generalRanking() });
      } catch {
        patchState(store, { saveFailed: true });
      } finally {
        patchState(store, { saving: false });
      }
    }

    return {
    async load(): Promise<void> {
      patchState(store, { status: 'loading' });
      try {
        patchState(store, { ranking: await api.generalRanking(), status: 'ready' });
      } catch {
        patchState(store, { ranking: null, status: 'error' });
      }
    },

    /** Apparaître sous son pseudo ou sous un alias, puis relire le classement (sa ligne y change de nom). */
    async setMode(mode: 'pseudo' | 'alias'): Promise<void> {
      await save(() => api.setRankingIdentity(mode));
    },

    /** « Autre alias ». */
    async drawAlias(): Promise<void> {
      await save(() => api.drawRankingAlias());
    },
    };
  }),
);

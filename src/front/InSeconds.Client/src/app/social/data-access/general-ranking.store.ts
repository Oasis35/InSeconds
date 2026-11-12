import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { GeneralRanking } from '../domain/group';
import { SocialApi } from './social.api';

interface GeneralRankingState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  ranking: GeneralRanking | null;
  /** Le choix d'apparaître est en cours d'envoi. */
  saving: boolean;
  /** Le dernier changement de visibilité a été refusé. */
  saveFailed: boolean;
}

/** Le classement général et le choix d'y apparaître. À fournir à l'écran qui l'affiche. */
export const GeneralRankingStore = signalStore(
  withState<GeneralRankingState>({ status: 'idle', ranking: null, saving: false, saveFailed: false }),
  withMethods((store, api = inject(SocialApi)) => ({
    async load(): Promise<void> {
      patchState(store, { status: 'loading' });
      try {
        patchState(store, { ranking: await api.generalRanking(), status: 'ready' });
      } catch {
        patchState(store, { ranking: null, status: 'error' });
      }
    },

    /** Change le choix puis relit le classement (sa propre ligne y entre ou en sort). */
    async setVisible(visible: boolean): Promise<void> {
      if (store.saving()) return;
      patchState(store, { saving: true, saveFailed: false });
      try {
        await api.setRankingVisibility(visible);
        patchState(store, { ranking: await api.generalRanking() });
      } catch {
        patchState(store, { saveFailed: true });
      } finally {
        patchState(store, { saving: false });
      }
    },
  })),
);

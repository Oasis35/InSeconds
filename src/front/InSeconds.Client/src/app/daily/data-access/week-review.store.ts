import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { WeekReview } from '../domain/week-review';
import { DailyApi } from './daily.api';

interface WeekReviewState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** `null` : un navigateur inconnu du serveur, rien joué. */
  review: WeekReview | null;
}

/** Le bilan de la semaine passée du joueur. À fournir à la page (l'accueil ou l'historique). */
export const WeekReviewStore = signalStore(
  withState<WeekReviewState>({ status: 'idle', review: null }),
  withMethods((store, api = inject(DailyApi)) => {
    let started = false;
    return {
      /** Lit le bilan, une seule fois par page ; un échec laisse simplement la carte absente. */
      async load(): Promise<void> {
        if (started) return;
        started = true;
        patchState(store, { status: 'loading' });
        try {
          patchState(store, { status: 'ready', review: await api.weekReview() });
        } catch {
          patchState(store, { status: 'error' });
        }
      },
    };
  }),
);

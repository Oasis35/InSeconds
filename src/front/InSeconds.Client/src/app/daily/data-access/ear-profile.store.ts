import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { EarProfile, ProfilePeriod } from '../domain/ear-profile';
import { DailyApi } from './daily.api';

interface EarProfileState {
  status: 'loading' | 'ready' | 'error';
  period: ProfilePeriod;
  /** `null` : un navigateur inconnu du serveur, rien joué. */
  profile: EarProfile | null;
}

/** Le profil d'oreille du joueur, une période à la fois. À fournir à la page (ou à la carte de l'historique). */
export const EarProfileStore = signalStore(
  withState<EarProfileState>({ status: 'loading', period: '8w', profile: null }),
  withMethods((store, api = inject(DailyApi)) => {
    let latest = 0;
    return {
      /** Lit le profil de cette période. Une réponse dépassée par une demande plus récente est ignorée. */
      async load(period: ProfilePeriod): Promise<void> {
        const id = ++latest;
        patchState(store, { status: 'loading', period });
        try {
          const profile = await api.earProfile(period);
          if (id === latest) patchState(store, { status: 'ready', profile });
        } catch {
          if (id === latest) patchState(store, { status: 'error' });
        }
      },
    };
  }),
);

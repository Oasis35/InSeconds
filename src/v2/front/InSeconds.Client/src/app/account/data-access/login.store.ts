import { inject } from '@angular/core';
import { patchState, signalStore, withMethods } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { normalizeEmail } from '../domain/email';
import { PlayersApi } from './players.api';

/**
 * Demande de lien de connexion (`/account/login`). La réponse de l'API est la même que l'adresse
 * ait un compte ou non (204) : le store n'en déduit rien et l'écran affiche toujours le même
 * message de succès.
 */
export const LoginStore = signalStore(
  withRequestStatus(),
  withMethods((store, api = inject(PlayersApi)) => ({
    async requestLink(email: string): Promise<void> {
      patchState(store, setPending());
      try {
        await api.requestMagicLink(normalizeEmail(email));
        patchState(store, setFulfilled());
      } catch (error) {
        patchState(store, setError(await toAppError(error)));
      }
    },
  })),
);

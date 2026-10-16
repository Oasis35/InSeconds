import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { PlayersApi } from './players.api';
import { SessionLoader } from './session-loader';

interface ConfirmEmailState {
  confirmedEmail: string | null;
}

/**
 * Confirmation du changement d'email (`/account/confirm-email?token=`), depuis le lien reçu à la
 * nouvelle adresse. Comme la connexion, le jeton ne se consomme qu'au clic sur « Confirmer ».
 */
export const ConfirmEmailStore = signalStore(
  withRequestStatus(),
  withState<ConfirmEmailState>({ confirmedEmail: null }),
  withMethods((store, api = inject(PlayersApi), loader = inject(SessionLoader)) => ({
    async confirm(token: string): Promise<void> {
      patchState(store, setPending());
      try {
        const email = await api.confirmEmailChange(token);
        patchState(store, { confirmedEmail: email }, setFulfilled());
        // Ce navigateur est peut-être connecté à ce compte (ou à un autre) : on relit l'identité plutôt que de la deviner.
        await loader.reload();
      } catch (error) {
        patchState(store, setError(await toAppError(error)));
      }
    },
  })),
);

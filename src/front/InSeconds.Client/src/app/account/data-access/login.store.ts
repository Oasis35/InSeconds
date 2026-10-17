import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { normalizeEmail } from '../domain/email';
import { PlayersApi } from './players.api';

interface LoginState {
  /** Adresse à laquelle le dernier lien est parti, affichée pour qu'une faute de frappe se voie. */
  sentTo: string | null;
  /** Heure du dernier envoi réussi (ms), pour le délai avant « Renvoyer le lien ». */
  sentAt: number | null;
  /** Le dernier envoi est un renvoi. */
  resent: boolean;
}

/**
 * Demande de lien de connexion (`/account/login`). La réponse de l'API est la même que l'adresse
 * ait un compte ou non (204) : le store n'en déduit rien et l'écran affiche toujours le même
 * message de succès, avec l'adresse saisie.
 */
export const LoginStore = signalStore(
  withRequestStatus(),
  withState<LoginState>({ sentTo: null, sentAt: null, resent: false }),
  withMethods((store, api = inject(PlayersApi)) => {
    async function send(email: string, resent: boolean): Promise<void> {
      patchState(store, setPending());
      try {
        await api.requestMagicLink(email);
        patchState(store, setFulfilled(), { sentTo: email, sentAt: Date.now(), resent });
      } catch (error) {
        patchState(store, setError(await toAppError(error)));
      }
    }

    return {
      requestLink: (email: string): Promise<void> => send(normalizeEmail(email), false),
      /** Renvoie le lien à la même adresse (le délai est à la charge de l'écran). */
      async resend(): Promise<void> {
        const email = store.sentTo();
        if (email !== null) await send(email, true);
      },
    };
  }),
);

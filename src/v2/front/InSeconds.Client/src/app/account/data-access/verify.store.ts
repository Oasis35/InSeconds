import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { AppError, toAppError } from '../../core/errors/app-error';
import { VerifyStep, afterFailure, afterVerified, confirming, initialVerifyStep } from '../domain/verify-flow';
import { normalizePseudo } from '../domain/pseudo';
import { PlayersApi } from './players.api';
import { SessionLoader } from './session-loader';

interface VerifyState {
  step: VerifyStep;
  /** Dernière erreur, pour afficher son code quand l'échec n'est pas un lien refusé. */
  error: AppError | null;
}

/**
 * Confirmation d'un lien de connexion (`/account/login/verify`). Enveloppe la machine à états de
 * `domain/verify-flow` : l'état du store est l'étape, ses méthodes en sont les transitions. Le
 * jeton n'est consommé que par `confirm()` / `submitPseudo()`, jamais à l'ouverture de la page.
 */
export const VerifyStore = signalStore(
  withState<VerifyState>({ step: initialVerifyStep(null), error: null }),
  withMethods((store, api = inject(PlayersApi), loader = inject(SessionLoader)) => {
    async function verify(token: string, pseudo: string | undefined): Promise<void> {
      patchState(store, { step: confirming, error: null });
      try {
        const { needsPseudo } = await api.verifyMagicLink(token, pseudo);
        if (needsPseudo) {
          patchState(store, { step: afterVerified(true) });
          return;
        }
        await loader.reload();
        patchState(store, { step: afterVerified(false) });
      } catch (error) {
        const appError = await toAppError(error);
        patchState(store, { step: afterFailure(appError.code, pseudo !== undefined), error: appError });
      }
    }

    return {
      /** Pose le jeton de l'adresse (`?token=`), sans rien consommer. */
      open(token: string | null): void {
        patchState(store, { step: initialVerifyStep(token), error: null });
      },
      confirm: (token: string): Promise<void> => verify(token, undefined),
      submitPseudo: (token: string, pseudo: string): Promise<void> => verify(token, normalizePseudo(pseudo)),
    };
  }),
);

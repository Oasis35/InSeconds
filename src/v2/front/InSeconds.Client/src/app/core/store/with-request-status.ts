import { computed } from '@angular/core';
import { signalStoreFeature, withComputed, withState } from '@ngrx/signals';
import { AppError } from '../errors/app-error';

/**
 * État d'une requête, partagé par tous les stores (§ 6.2 du plan v2) : chargement, succès ou
 * erreur avec son code. Le store appelle `patchState(store, setPending())` avant l'appel, puis
 * `setFulfilled()` ou `setError(error)`.
 */
export type RequestStatus = 'idle' | 'pending' | 'fulfilled' | { readonly error: AppError };

export interface RequestStatusState {
  requestStatus: RequestStatus;
}

export function withRequestStatus() {
  return signalStoreFeature(
    withState<RequestStatusState>({ requestStatus: 'idle' }),
    withComputed(({ requestStatus }) => ({
      isPending: computed(() => requestStatus() === 'pending'),
      isFulfilled: computed(() => requestStatus() === 'fulfilled'),
      error: computed(() => {
        const status = requestStatus();
        return typeof status === 'object' ? status.error : null;
      }),
    })),
  );
}

export function setPending(): RequestStatusState {
  return { requestStatus: 'pending' };
}

export function setFulfilled(): RequestStatusState {
  return { requestStatus: 'fulfilled' };
}

export function setError(error: AppError): RequestStatusState {
  return { requestStatus: { error } };
}

import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { SessionStore } from '../../core/session/session.store';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { Device } from '../domain/device';
import { ActionStatus } from './profile.store';
import { PlayersApi } from './players.api';

interface DevicesState {
  devices: readonly Device[];
  /** Appareil dont la déconnexion est en cours. */
  busyId: number | null;
  action: ActionStatus;
}

/** Résultat de la déconnexion d'un appareil. */
export type RevokeOutcome = 'revoked' | 'signed-out' | 'failed';

/**
 * Appareils connectés au compte : liste, déconnexion d'un appareil, « déconnecter les autres ». Un
 * appareil déconnecté est refusé dès sa requête suivante côté back. Déconnecter l'appareil
 * courant revient à se déconnecter : la session est vidée.
 */
export const DevicesStore = signalStore(
  withRequestStatus(),
  withState<DevicesState>({ devices: [], busyId: null, action: 'idle' }),
  withComputed(({ devices }) => ({
    others: computed(() => devices().filter(device => !device.isCurrent)),
  })),
  withMethods((store, api = inject(PlayersApi), session = inject(SessionStore)) => ({
    async load(): Promise<void> {
      patchState(store, setPending());
      try {
        patchState(store, { devices: await api.listDevices() }, setFulfilled());
      } catch (error) {
        patchState(store, setError(await toAppError(error)));
      }
    },

    async revoke(id: number): Promise<RevokeOutcome> {
      const current = store.devices().find(device => device.id === id)?.isCurrent === true;
      patchState(store, { busyId: id, action: 'pending' });
      try {
        await api.revokeDevice(id);
      } catch (error) {
        patchState(store, { busyId: null, action: { error: await toAppError(error) } });
        return 'failed';
      }
      if (current) {
        session.signedOut();
        patchState(store, { devices: [], busyId: null, action: 'done' });
        return 'signed-out';
      }
      patchState(store, { devices: store.devices().filter(device => device.id !== id), busyId: null, action: 'done' });
      return 'revoked';
    },

    /** Déconnecte tous les autres appareils ; `true` si c'est fait. */
    async revokeOthers(): Promise<boolean> {
      patchState(store, { action: 'pending' });
      try {
        await api.revokeOtherDevices();
      } catch (error) {
        patchState(store, { action: { error: await toAppError(error) } });
        return false;
      }
      patchState(store, { devices: store.devices().filter(device => device.isCurrent), action: 'done' });
      return true;
    },
  })),
);

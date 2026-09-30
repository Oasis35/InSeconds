import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

/** Ce que le front sait du joueur courant. Rempli par le module Players (B1/B5). */
export interface SessionPlayer {
  readonly id: string;
  readonly pseudo: string | null;
  readonly isGuest: boolean;
  readonly isAdmin: boolean;
}

interface SessionState {
  player: SessionPlayer | null;
}

/**
 * Session du joueur, lue par tous les domaines (header, garde admin, nudges de connexion).
 * Socle seulement en A4 : l'appel `GET /api/players/me` arrive avec le module Players, qui
 * appellera `signedIn()`. Pas de joueur = visiteur qui n'a encore rien démarré (aucune trace
 * en base, comme en v1).
 */
export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState<SessionState>({ player: null }),
  withComputed(({ player }) => ({
    isKnown: computed(() => player() !== null),
    isLinked: computed(() => player()?.isGuest === false),
    isAdmin: computed(() => player()?.isAdmin === true),
  })),
  withMethods(store => ({
    signedIn(player: SessionPlayer): void {
      patchState(store, { player });
    },
    signedOut(): void {
      patchState(store, { player: null });
    },
  })),
);

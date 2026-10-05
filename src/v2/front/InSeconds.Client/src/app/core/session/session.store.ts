import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

/** Ce que le front sait du joueur courant. Rempli par le domaine `account` (`GET /api/players/me`). */
export interface SessionPlayer {
  readonly id: string;
  readonly pseudo: string | null;
  /** Adresse du compte ; `null` pour un invité. Jamais affichée à un autre joueur. */
  readonly email: string | null;
  readonly isGuest: boolean;
  readonly isAdmin: boolean;
}

interface SessionState {
  player: SessionPlayer | null;
  /** `true` une fois la première lecture de l'identité terminée (réussie ou non) : avant, « pas de joueur » ne veut encore rien dire. */
  loaded: boolean;
}

/**
 * Session du joueur, lue par tous les domaines (header, garde de profil, garde admin, nudges de
 * connexion). Remplie par `account` : au chargement de l'app (`GET /api/players/me`, 204 sans
 * identité), après une connexion, un changement de pseudo ou d'email, et vidée à la déconnexion.
 * Pas de joueur = visiteur qui n'a encore rien démarré (aucune trace en base, comme en v1).
 */
export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState<SessionState>({ player: null, loaded: false }),
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
    markLoaded(): void {
      patchState(store, { loaded: true });
    },
  })),
);

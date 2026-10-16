import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { AppError, toAppError } from '../../core/errors/app-error';
import { SessionStore } from '../../core/session/session.store';
import { isPlausibleEmail, normalizeEmail, sameEmail } from '../domain/email';
import { normalizePseudo, pseudoIssue } from '../domain/pseudo';
import { PlayersApi } from './players.api';

/** Avancement d'une action du profil : au repos, en cours, réussie, ou en échec avec son code d'erreur. */
export type ActionStatus = 'idle' | 'pending' | 'done' | { readonly error: AppError };

interface ProfileState {
  pseudoStatus: ActionStatus;
  emailStatus: ActionStatus;
  logoutStatus: ActionStatus;
}

/**
 * Actions du profil : pseudo, demande de changement d'email, déconnexion. Chaque action a son
 * propre avancement ; l'écran remet l'avancement au repos (`clear…`) quand le joueur retape.
 */
export const ProfileStore = signalStore(
  withState<ProfileState>({ pseudoStatus: 'idle', emailStatus: 'idle', logoutStatus: 'idle' }),
  withMethods((store, api = inject(PlayersApi), session = inject(SessionStore)) => ({
    clearPseudo: (): void => patchState(store, { pseudoStatus: 'idle' }),
    clearEmailChange: (): void => patchState(store, { emailStatus: 'idle' }),

    async savePseudo(raw: string): Promise<void> {
      const player = session.player();
      const pseudo = normalizePseudo(raw);
      if (!player || player.isGuest || pseudoIssue(pseudo) !== null || pseudo === player.pseudo) return;

      patchState(store, { pseudoStatus: 'pending' });
      try {
        const saved = await api.updatePseudo(pseudo);
        session.signedIn({ ...player, pseudo: saved });
        patchState(store, { pseudoStatus: 'done' });
      } catch (error) {
        patchState(store, { pseudoStatus: { error: await toAppError(error) } });
      }
    },

    async requestEmailChange(raw: string): Promise<void> {
      const player = session.player();
      const email = normalizeEmail(raw);
      if (!player || player.isGuest || !isPlausibleEmail(email) || sameEmail(email, player.email)) return;

      patchState(store, { emailStatus: 'pending' });
      try {
        await api.requestEmailChange(email);
        patchState(store, { emailStatus: 'done' });
      } catch (error) {
        patchState(store, { emailStatus: { error: await toAppError(error) } });
      }
    },

    /** Déconnecte ce navigateur ; `true` si c'est fait (la session est alors vidée). */
    async logout(): Promise<boolean> {
      patchState(store, { logoutStatus: 'pending' });
      try {
        await api.logout();
        session.signedOut();
        patchState(store, { logoutStatus: 'done' });
        return true;
      } catch (error) {
        patchState(store, { logoutStatus: { error: await toAppError(error) } });
        return false;
      }
    },
  })),
);

import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { AppError, toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { AdminGroup, filterGroups } from '../domain/admin-group';
import { AdminGroupsApi } from './groups.api';

interface GroupsState {
  groups: readonly AdminGroup[];
  filter: string;
  /** Les groupes dont une action attend la réponse de l'API (une seule action à la fois par groupe). */
  pendingIds: readonly number[];
  /** La dernière action refusée par l'API (l'état affiché n'a pas changé) : le code à traduire, avec le groupe visé. */
  actionError: { groupId: number; error: AppError } | null;
}

/**
 * L'onglet Groupes de l'admin : tous les groupes (lus à l'ouverture), filtre texte, et la modération : renommer, remettre le nom à zéro, supprimer.
 * L'état affiché ne change qu'une fois l'API d'accord ; un refus se lit dans `actionError`.
 */
export const AdminGroupsStore = signalStore(
  withRequestStatus(),
  withState<GroupsState>({ groups: [], filter: '', pendingIds: [], actionError: null }),
  withComputed(({ groups, filter }) => ({
    filteredGroups: computed(() => filterGroups(groups(), filter())),
  })),
  withMethods((store, api = inject(AdminGroupsApi)) => {
    let latestLoad = 0;

    /** Joue une action sur un groupe : pose son attente, rend si elle a réussi, garde l'erreur sinon. */
    async function act(groupId: number, action: () => Promise<void>): Promise<boolean> {
      if (store.pendingIds().includes(groupId)) return false;
      patchState(store, { pendingIds: [...store.pendingIds(), groupId], actionError: null });
      try {
        await action();
        return true;
      } catch (error) {
        patchState(store, { actionError: { groupId, error: await toAppError(error) } });
        return false;
      } finally {
        patchState(store, { pendingIds: store.pendingIds().filter(id => id !== groupId) });
      }
    }

    function rename(groupId: number, name: string): void {
      patchState(store, { groups: store.groups().map(g => (g.id === groupId ? { ...g, name } : g)) });
    }

    return {
      async load(): Promise<void> {
        const mine = ++latestLoad;
        patchState(store, setPending());
        try {
          const groups = await api.list();
          if (mine === latestLoad) patchState(store, { groups, actionError: null }, setFulfilled());
        } catch (error) {
          const appError = await toAppError(error);
          if (mine === latestLoad) patchState(store, setError(appError));
        }
      },

      setFilter: (filter: string) => patchState(store, { filter }),

      /** Donne un autre nom au groupe ; rend `true` si l'API l'a accepté (400 `social.invalid_name` sinon). */
      renameGroup: (groupId: number, name: string): Promise<boolean> =>
        act(groupId, async () => rename(groupId, await api.rename(groupId, name))),

      /** Remplace le nom par le nom de remplacement que choisit l'API. */
      resetGroupName: (groupId: number): Promise<boolean> =>
        act(groupId, async () => rename(groupId, await api.resetName(groupId))),

      /** Supprime le groupe et le retire de la liste une fois l'API d'accord. */
      removeGroup: (groupId: number): Promise<boolean> =>
        act(groupId, async () => {
          await api.remove(groupId);
          patchState(store, { groups: store.groups().filter(g => g.id !== groupId) });
        }),

      clearActionError: () => patchState(store, { actionError: null }),
    };
  }),
);

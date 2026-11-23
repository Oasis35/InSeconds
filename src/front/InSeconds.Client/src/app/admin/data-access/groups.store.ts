import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { AppError, toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import { AdminGroup, AdminGroupMember, filterGroups } from '../domain/admin-group';
import { AdminGroupsApi } from './groups.api';

type MembersStatus = 'idle' | 'loading' | 'error';

interface GroupsState {
  groups: readonly AdminGroup[];
  filter: string;
  /** Les groupes dont une action attend la réponse de l'API (une seule action à la fois par groupe). */
  pendingIds: readonly number[];
  /** La dernière action refusée par l'API (l'état affiché n'a pas changé) : le code à traduire, avec le groupe visé. */
  actionError: { groupId: number; error: AppError } | null;
  /** Le groupe déplié (un seul à la fois) : ses membres et la modération s'affichent sous sa ligne. */
  expandedId: number | null;
  /** Les membres déjà lus, par groupe : ils restent affichés pendant une relecture. */
  members: Readonly<Record<number, readonly AdminGroupMember[]>>;
  membersStatus: MembersStatus;
}

/**
 * L'onglet Groupes de l'admin : tous les groupes (lus à l'ouverture), filtre texte, le groupe déplié avec ses membres (lus à chaque dépliage),
 * et la modération : renommer, remettre le nom à zéro, supprimer. L'état affiché ne change qu'une fois l'API d'accord ; un refus se lit dans `actionError`.
 */
export const AdminGroupsStore = signalStore(
  withRequestStatus(),
  withState<GroupsState>({ groups: [], filter: '', pendingIds: [], actionError: null, expandedId: null, members: {}, membersStatus: 'idle' }),
  withComputed(({ groups, filter, expandedId, members, membersStatus }) => ({
    filteredGroups: computed(() => filterGroups(groups(), filter())),
    /** Les membres du groupe déplié (`null` tant qu'aucune lecture n'a abouti) et l'état de leur lecture. */
    expandedMembers: computed(() => {
      const id = expandedId();
      return id === null ? null : { members: members()[id] ?? null, status: membersStatus() };
    }),
  })),
  withMethods((store, api = inject(AdminGroupsApi)) => {
    let latestLoad = 0;
    let latestMembers = 0;

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

    /**
     * Relit les groupes (effectifs, créateurs) et les membres du groupe déplié, sans repasser par l'état de chargement : la liste reste à l'écran.
     * Si le groupe déplié a disparu, il se replie.
     */
    async function refresh(): Promise<void> {
      const groups = await api.list();
      patchState(store, { groups });
      const expanded = store.expandedId();
      if (expanded === null) return;
      if (!groups.some(g => g.id === expanded)) {
        latestMembers++;
        patchState(store, { expandedId: null, membersStatus: 'idle' });
        return;
      }
      const mine = ++latestMembers;
      const members = await api.members(expanded);
      if (mine === latestMembers) patchState(store, { members: { ...store.members(), [expanded]: members }, membersStatus: 'idle' });
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
          if (store.expandedId() === groupId) {
            latestMembers++;
            patchState(store, { expandedId: null, membersStatus: 'idle' });
          }
        }),

      /** Déplie le groupe (et relit ses membres), ou le replie s'il l'était. */
      async toggle(groupId: number): Promise<void> {
        patchState(store, { actionError: null });
        if (store.expandedId() === groupId) {
          latestMembers++;
          patchState(store, { expandedId: null, membersStatus: 'idle' });
          return;
        }
        const mine = ++latestMembers;
        patchState(store, { expandedId: groupId, membersStatus: 'loading' });
        try {
          const members = await api.members(groupId);
          if (mine !== latestMembers) return;
          patchState(store, { members: { ...store.members(), [groupId]: members }, membersStatus: 'idle' });
        } catch {
          if (mine === latestMembers) patchState(store, { membersStatus: 'error' });
        }
      },

      /** Confie le groupe au membre de ce pseudo, puis relit les membres : l'ancien créateur n'est plus qu'un membre. */
      transferOwner: (groupId: number, pseudo: string): Promise<boolean> =>
        act(groupId, async () => {
          await api.transferOwner(groupId, pseudo);
          await refresh();
        }),

      /**
       * Retire le membre, avec le successeur désigné quand c'est le créateur, puis relit la liste et les membres. Le dernier membre retiré supprime le
       * groupe : il disparaît de la liste et se replie.
       */
      removeMember: (groupId: number, pseudo: string, successor: string | null): Promise<boolean> =>
        act(groupId, async () => {
          await api.removeMember(groupId, pseudo, successor);
          await refresh();
        }),

      clearActionError: () => patchState(store, { actionError: null }),
    };
  }),
);

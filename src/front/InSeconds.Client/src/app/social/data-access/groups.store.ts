import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Group, GroupRanking, GroupStanding, standingOf } from '../domain/group';
import { SocialApi } from './social.api';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface GroupsState {
  status: Status;
  groups: readonly Group[];
  maxGroups: number;
  /** Le groupe dont on lit le classement. */
  selectedId: number | null;
  ranking: GroupRanking | null;
  rankingStatus: Status;
  /** La place du joueur dans chacun de ses groupes ; `null` tant qu'elle n'est pas lue. */
  standings: readonly GroupStanding[] | null;
}

/** Les groupes du joueur, le classement de celui qu'il regarde et sa place dans chacun. À fournir à la page. */
export const GroupsStore = signalStore(
  withState<GroupsState>({ status: 'idle', groups: [], maxGroups: 0, selectedId: null, ranking: null, rankingStatus: 'idle', standings: null }),
  withComputed(store => ({
    selected: computed(() => store.groups().find(group => group.id === store.selectedId()) ?? null),
    canCreate: computed(() => store.status() === 'ready' && store.groups().length < store.maxGroups()),
  })),
  withMethods((store, api = inject(SocialApi)) => {
    let request = 0;

    async function loadRanking(groupId: number): Promise<void> {
      const id = ++request;
      patchState(store, { selectedId: groupId, rankingStatus: 'loading' });
      try {
        const ranking = await api.ranking(groupId);
        if (id === request) patchState(store, { ranking, rankingStatus: 'ready' });
      } catch {
        if (id === request) patchState(store, { ranking: null, rankingStatus: 'error' });
      }
    }

    return {
      /** Lit mes groupes puis le classement du groupe demandé (à défaut, du premier). */
      async load(preferredId: number | null = null): Promise<void> {
        patchState(store, { status: 'loading' });
        try {
          const { groups, maxGroups } = await api.myGroups();
          patchState(store, { status: 'ready', groups, maxGroups });
          const target = groups.find(group => group.id === preferredId) ?? groups[0];
          if (target) await loadRanking(target.id);
          else patchState(store, { selectedId: null, ranking: null, rankingStatus: 'idle' });
        } catch {
          patchState(store, { status: 'error' });
        }
      },

      /** Regarde un autre de mes groupes. */
      async select(groupId: number): Promise<void> {
        if (groupId === store.selectedId() && store.rankingStatus() !== 'error') return;
        if (store.groups().some(group => group.id === groupId)) await loadRanking(groupId);
      },

      /** Quitte un groupe puis relit la liste ; `false` si le serveur a refusé. */
      async leave(groupId: number): Promise<boolean> {
        try {
          await api.leave(groupId);
        } catch {
          return false;
        }
        await this.load();
        return true;
      },

      /** Lit mes groupes et ma place dans chacun (la fin d'une partie, avec ce que la partie a ajouté au niveau pour en tirer une montée). Une erreur laisse la liste vide : ces lignes sont un plus. */
      async loadStandings(delta: number | null = null): Promise<void> {
        try {
          const { groups, maxGroups } = await api.myGroups();
          patchState(store, { status: 'ready', groups, maxGroups });
          const rankings = await Promise.all(groups.map(group => api.ranking(group.id).catch(() => null)));
          patchState(store, { standings: rankings.filter((ranking): ranking is GroupRanking => ranking !== null).map(ranking => standingOf(ranking, delta)) });
        } catch {
          patchState(store, { status: 'error', standings: [] });
        }
      },
    };
  }),
);

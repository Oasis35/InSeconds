import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Group, GroupRanking, GroupStanding, preferredGroupId, standingOf } from '../domain/group';
import { GroupScores } from '../domain/group-scores';
import { LastGroup } from './last-group';
import { SocialApi } from './social.api';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface GroupsState {
  status: Status;
  groups: readonly Group[];
  maxGroups: number;
  /** Le groupe dont on lit le classement. */
  selectedId: number | null;
  /** Son classement au Défi du jour (le jour et la semaine) ; `scoresFor` : le groupe lu ou en cours de lecture. */
  scores: GroupScores | null;
  scoresFor: number | null;
  scoresStatus: Status;
  /** La place du joueur dans chacun de ses groupes, par niveau Survie (la fin d'une partie de Survie) ; `null` tant qu'elle n'est pas lue. */
  standings: readonly GroupStanding[] | null;
}

const NOTHING_READ = { scores: null, scoresFor: null, scoresStatus: 'idle' } as const;

/** Les groupes du joueur, le classement du Défi de celui qu'il regarde et sa place Survie dans chacun. À fournir à la page. */
export const GroupsStore = signalStore(
  withState<GroupsState>({ status: 'idle', groups: [], maxGroups: 0, selectedId: null, ...NOTHING_READ, standings: null }),
  withComputed(store => ({
    selected: computed(() => store.groups().find(group => group.id === store.selectedId()) ?? null),
    canCreate: computed(() => store.status() === 'ready' && store.groups().length < store.maxGroups()),
    /** Les scores du groupe regardé : jamais ceux d'un autre groupe le temps d'une lecture. */
    selectedScores: computed(() => (store.scores()?.groupId === store.selectedId() ? store.scores() : null)),
  })),
  withMethods((store, api = inject(SocialApi), lastGroup = inject(LastGroup)) => {
    let scoresRequest = 0;

    async function loadScores(groupId: number): Promise<void> {
      const id = ++scoresRequest;
      patchState(store, { scoresFor: groupId, scoresStatus: 'loading' });
      try {
        const scores = await api.scores(groupId);
        if (id === scoresRequest) patchState(store, { scores, scoresStatus: 'ready' });
      } catch {
        if (id === scoresRequest) patchState(store, { scores: null, scoresFor: null, scoresStatus: 'error' });
      }
    }

    /** Regarde un groupe : ses scores sont lus une fois, une lecture en échec se refait. */
    async function show(groupId: number): Promise<void> {
      // Le groupe regardé devient celui de la carte amis de l'accueil.
      lastGroup.set(groupId);
      patchState(store, { selectedId: groupId });
      if (store.scoresFor() !== groupId) await loadScores(groupId);
    }

    return {
      /** Lit mes groupes puis le classement du groupe demandé (à défaut, du dernier regardé, puis du premier). */
      async load(preferredId: number | null = null): Promise<void> {
        patchState(store, { status: 'loading' });
        try {
          const { groups, maxGroups } = await api.myGroups();
          // Une relecture (après « Quitter ») repart de zéro : une réponse encore en route est ignorée, rien d'un groupe quitté ne reste affiché.
          scoresRequest++;
          patchState(store, { status: 'ready', groups, maxGroups, ...NOTHING_READ });
          // Sans groupe demandé (l'onglet « Groupes »), le dernier regardé : la barre du bas ne le remplace pas par le premier.
          const target = preferredGroupId(groups.map(group => group.id), preferredId ?? lastGroup.get());
          if (target !== null) await show(target);
          else patchState(store, { selectedId: null });
        } catch {
          patchState(store, { status: 'error' });
        }
      },

      /** Regarde un autre de mes groupes. */
      async select(groupId: number): Promise<void> {
        if (store.groups().some(group => group.id === groupId)) await show(groupId);
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

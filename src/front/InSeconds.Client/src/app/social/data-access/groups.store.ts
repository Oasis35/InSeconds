import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Group, GroupRanking, GroupStanding, standingOf } from '../domain/group';
import { GroupScores } from '../domain/group-scores';
import { SocialApi } from './social.api';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface GroupsState {
  status: Status;
  groups: readonly Group[];
  maxGroups: number;
  /** Le groupe dont on lit le classement. */
  selectedId: number | null;
  /** Son classement au Défi du jour (le jour et la semaine), pour tous ; `scoresFor` : le groupe lu ou en cours de lecture. */
  scores: GroupScores | null;
  scoresFor: number | null;
  scoresStatus: Status;
  /** Son classement en Survie (par niveau), lu seulement quand on le regarde (l'accès Survie) ; `rankingFor` : idem. */
  ranking: GroupRanking | null;
  rankingFor: number | null;
  rankingStatus: Status;
  /** La place du joueur dans chacun de ses groupes ; `null` tant qu'elle n'est pas lue. */
  standings: readonly GroupStanding[] | null;
}

const NOTHING_READ = { scores: null, scoresFor: null, scoresStatus: 'idle', ranking: null, rankingFor: null, rankingStatus: 'idle' } as const;

/** Les groupes du joueur, les classements de celui qu'il regarde et sa place dans chacun. À fournir à la page. */
export const GroupsStore = signalStore(
  withState<GroupsState>({ status: 'idle', groups: [], maxGroups: 0, selectedId: null, ...NOTHING_READ, standings: null }),
  withComputed(store => ({
    selected: computed(() => store.groups().find(group => group.id === store.selectedId()) ?? null),
    canCreate: computed(() => store.status() === 'ready' && store.groups().length < store.maxGroups()),
    /** Les scores du groupe regardé : jamais ceux d'un autre groupe le temps d'une lecture. */
    selectedScores: computed(() => (store.scores()?.groupId === store.selectedId() ? store.scores() : null)),
    /** Son classement Survie, avec la même garantie. */
    selectedRanking: computed(() => (store.ranking()?.groupId === store.selectedId() ? store.ranking() : null)),
  })),
  withMethods((store, api = inject(SocialApi)) => {
    let scoresRequest = 0;
    let rankingRequest = 0;

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

    async function loadRanking(groupId: number): Promise<void> {
      const id = ++rankingRequest;
      patchState(store, { rankingFor: groupId, rankingStatus: 'loading' });
      try {
        const ranking = await api.ranking(groupId);
        if (id === rankingRequest) patchState(store, { ranking, rankingStatus: 'ready' });
      } catch {
        if (id === rankingRequest) patchState(store, { ranking: null, rankingFor: null, rankingStatus: 'error' });
      }
    }

    /** Lit ce qui manque au groupe regardé : ses scores, et son classement Survie si on le demande. Une lecture en échec se refait. */
    async function show(groupId: number, survie: boolean): Promise<void> {
      patchState(store, { selectedId: groupId });
      const reads: Promise<void>[] = [];
      if (store.scoresFor() !== groupId) reads.push(loadScores(groupId));
      if (survie && store.rankingFor() !== groupId) reads.push(loadRanking(groupId));
      await Promise.all(reads);
    }

    return {
      /** Lit mes groupes puis le classement du groupe demandé (à défaut, du premier) ; avec `survie`, aussi son classement Survie. */
      async load(preferredId: number | null = null, survie = false): Promise<void> {
        patchState(store, { status: 'loading' });
        try {
          const { groups, maxGroups } = await api.myGroups();
          // Une relecture (après « Quitter ») repart de zéro : une réponse encore en route est ignorée, rien d'un groupe quitté ne reste affiché.
          scoresRequest++;
          rankingRequest++;
          patchState(store, { status: 'ready', groups, maxGroups, ...NOTHING_READ });
          const target = groups.find(group => group.id === preferredId) ?? groups[0];
          if (target) await show(target.id, survie);
          else patchState(store, { selectedId: null });
        } catch {
          patchState(store, { status: 'error' });
        }
      },

      /** Regarde un autre de mes groupes, ou la Survie du même. */
      async select(groupId: number, survie = false): Promise<void> {
        if (store.groups().some(group => group.id === groupId)) await show(groupId, survie);
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

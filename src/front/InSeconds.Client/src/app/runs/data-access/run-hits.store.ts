import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { StoragePort } from '../../core/storage/storage.port';
import { SocialApi } from '../../social/data-access/social.api';
import { RunHit, earnedKeys, freshHits, withGroupHit } from '../domain/run-hits';
import { RunsApi } from './runs.api';

/** Les Hits que ce navigateur a déjà montrés : des noms de Hits, rien du joueur. */
const SEEN_KEY = 'inseconds.hits.seen';

interface RunHitsState {
  status: 'loading' | 'ready' | 'error';
  hits: readonly RunHit[];
  /** Les Hits obtenus depuis la dernière visite de l'écran des Hits sur ce navigateur. */
  fresh: readonly string[];
}

/**
 * Les Hits du joueur : ceux du mode (le serveur les calcule sur ses parties finies) et celui des groupes. Ce qui est « nouveau » est tenu par ce
 * navigateur seulement : la liste des Hits déjà montrés. À fournir à l'écran qui les affiche.
 */
export const RunHitsStore = signalStore(
  withState<RunHitsState>({ status: 'loading', hits: [], fresh: [] }),
  withComputed(store => ({
    earnedCount: computed(() => store.hits().filter(hit => hit.earned).length),
    total: computed(() => store.hits().length),
  })),
  withMethods((store, api = inject(RunsApi), social = inject(SocialApi), storage = inject(StoragePort)) => {
    const readSeen = (): string[] | null => {
      try {
        const seen: unknown = JSON.parse(storage.get(SEEN_KEY) ?? 'null');
        return Array.isArray(seen) ? seen.filter((key): key is string => typeof key === 'string') : null;
      } catch {
        return null;
      }
    };

    return {
      /**
       * Lit les Hits. `markSeen` : l'écran des Hits, qui les montre tous, note ceux qui sont obtenus ; ailleurs (accueil, fin de partie) on ne fait
       * que regarder, pour que l'écran des Hits puisse encore fêter les nouveaux.
       */
      async load(markSeen: boolean): Promise<void> {
        patchState(store, { status: 'loading' });
        try {
          // Les groupes sont un plus : sans eux (erreur, invité), le Hit des groupes reste à obtenir.
          const [hits, hasGroup] = await Promise.all([api.hits(), social.myGroups().then(mine => mine.groups.length > 0, () => false)]);
          const all = hits.length ? withGroupHit(hits, hasGroup) : [];
          const seen = readSeen();
          patchState(store, { status: 'ready', hits: all, fresh: freshHits(all, seen) });
          if (all.length && (markSeen || seen === null)) storage.set(SEEN_KEY, JSON.stringify(earnedKeys(all)));
        } catch {
          patchState(store, { status: 'error' });
        }
      },
    };
  }),
);

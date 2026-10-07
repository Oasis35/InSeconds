import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { AppError, toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import {
  DEFAULT_TRACKS_PER_CHALLENGE, NO_FILTERS, PoolFilters, PoolSort, PreviewFilter, SortColumn,
  StatusFilter, clampPage, filterTracks, nextSort, pageOf, poolDaysRemaining, runwayTone, sortTracks, totalPages,
} from '../domain/pool-filters';
import { PoolTrack, isUsed } from '../domain/pool-track';
import { CatalogueApi } from './catalogue.api';

/** Ce qu'une désactivation refusée a dit : le morceau est dans le défi du jour, ou autre chose a échoué. */
export type ToggleError = 'inToday' | 'error';

const TRACK_IN_TODAY_CHALLENGE = 'catalogue.track_in_today_challenge';
const NOT_FOUND = 'common.not_found';

/** Ce qu'une désactivation a rendu, vu de l'écran : rien, refus du défi du jour, ou autre échec. */
function toToggleError(error: AppError | null): ToggleError | null {
  if (error === null) return null;
  return error.code === TRACK_IN_TODAY_CHALLENGE ? 'inToday' : 'error';
}

interface PoolState {
  tracks: readonly PoolTrack[];
  filters: PoolFilters;
  sort: PoolSort | null;
  /** Page demandée, à partir de 0 ; la page affichée est ramenée dans les bornes (`page`). */
  requestedPage: number;
  selectedIds: readonly number[];
  /** Morceaux dont la désactivation est en cours d'envoi (bouton désactivé le temps de la requête). */
  togglingIds: readonly number[];
  toggleError: ToggleError | null;
}

/**
 * Le pool de l'admin : liste des morceaux, filtres, tri, pagination, sélection, et les actions qui
 * le modifient (ajout, renommage, désactivation, suppression). Aucune mutation locale : après
 * chaque action réussie, la liste est relue (l'usage et les dates de déblocage viennent de l'API).
 * Les actions qui ouvrent une fenêtre rendent l'erreur à afficher dans celle-ci, ou `null`.
 */
export const PoolStore = signalStore(
  withRequestStatus(),
  withState<PoolState>({
    tracks: [], filters: NO_FILTERS, sort: null, requestedPage: 0, selectedIds: [], togglingIds: [], toggleError: null,
  }),
  withComputed(({ tracks, filters, sort, requestedPage, selectedIds }) => {
    const filtered = computed(() => filterTracks(tracks(), filters()));
    const sorted = computed(() => sortTracks(filtered(), sort()));
    const pages = computed(() => totalPages(filtered().length));
    const page = computed(() => clampPage(requestedPage(), filtered().length));
    return {
      filtered,
      pages,
      page,
      pageTracks: computed(() => pageOf(sorted(), page())),
      availableCount: computed(() => tracks().filter(t => !isUsed(t)).length),
      usedCount: computed(() => tracks().filter(isUsed).length),
      disabledCount: computed(() => tracks().filter(t => t.isDisabled).length),
      runwayDays: computed(() => poolDaysRemaining(tracks(), DEFAULT_TRACKS_PER_CHALLENGE)),
      /** Identifiant Deezer → vrai si le morceau est disponible, faux s'il a déjà servi : le badge « déjà en pool ». */
      existingDeezerIds: computed(() => new Map(tracks().map(t => [t.deezerTrackId, !isUsed(t)] as const))),
      /** Un morceau utilisé ne se supprime pas (409) : le bouton « Supprimer (N) » le sait d'avance. */
      selectionHasUsedTrack: computed(() => {
        const selected = new Set(selectedIds());
        return tracks().some(t => selected.has(t.id) && isUsed(t));
      }),
    };
  }),
  withComputed(({ pages, runwayDays }) => ({
    runwayTone: computed(() => runwayTone(runwayDays())),
    hasMultiplePages: computed(() => pages() > 1),
  })),
  withMethods((store, api = inject(CatalogueApi)) => {
    const resetPage = () => patchState(store, { requestedPage: 0 });
    const setFilter = (change: Partial<PoolFilters>) => {
      patchState(store, { filters: { ...store.filters(), ...change }, requestedPage: 0 });
    };

    /** Numéro de la lecture la plus récente : une réponse plus ancienne, arrivée après elle, n'écrit rien. */
    let latestLoad = 0;

    async function load(): Promise<void> {
      const mine = ++latestLoad;
      patchState(store, setPending());
      try {
        const tracks = await api.listTracks();
        if (mine !== latestLoad) return;
        const known = new Set(tracks.map(t => t.id));
        patchState(
          store,
          { tracks, selectedIds: store.selectedIds().filter(id => known.has(id)) },
          setFulfilled(),
        );
      } catch (error) {
        const appError = await toAppError(error);
        if (mine === latestLoad) patchState(store, setError(appError));
      }
    }

    /** Supprime un morceau ; déjà supprimé (une première tentative a abouti avant l'échec d'un autre) : rien à refaire. */
    async function deleteIgnoringMissing(id: number): Promise<void> {
      try {
        await api.deleteTrack(id);
      } catch (error_) {
        if ((await toAppError(error_)).code !== NOT_FOUND) throw error_;
      }
    }

    /** Lance une action de l'API ; relit le pool si elle réussit, rend l'erreur sinon. */
    async function mutate(action: () => Promise<void>): Promise<AppError | null> {
      try {
        await action();
      } catch (error) {
        return toAppError(error);
      }
      await load();
      return null;
    }

    return {
      load,

      // --- filtres, tri, pagination ---
      setText: (text: string) => setFilter({ text }),
      setStatus: (status: StatusFilter) => setFilter({ status }),
      setPreview: (preview: PreviewFilter) => setFilter({ preview }),
      setLastUsedFrom: (lastUsedFrom: string) => setFilter({ lastUsedFrom }),
      setLastUsedTo: (lastUsedTo: string) => setFilter({ lastUsedTo }),
      resetFilters: () => patchState(store, { filters: NO_FILTERS, requestedPage: 0 }),
      sortBy: (column: SortColumn) => patchState(store, { sort: nextSort(store.sort(), column) }),
      previousPage: () => patchState(store, { requestedPage: Math.max(0, store.page() - 1) }),
      nextPage: () => patchState(store, { requestedPage: Math.min(store.pages() - 1, store.page() + 1) }),
      /** Va à une page (à partir de 0), par exemple celle reprise de l'adresse au rechargement. */
      goToPage: (page: number) => patchState(store, { requestedPage: Math.max(0, Math.floor(page)) }),

      // --- sélection ---
      toggleSelection(id: number): void {
        const selected = store.selectedIds();
        patchState(store, { selectedIds: selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id] });
      },
      clearSelection: () => patchState(store, { selectedIds: [] }),
      /** Les morceaux sélectionnés, dans l'ordre du pool. */
      selectedTracks: () => store.tracks().filter(t => store.selectedIds().includes(t.id)),

      // --- actions ---
      add: (deezerTrackId: number) => mutate(() => api.addTrack(deezerTrackId)),
      rename: (id: number, artist: string, title: string) =>
        mutate(() => api.renameTrack(id, artist.trim(), title.trim())),

      /** Supprime ces morceaux (aucun n'a servi) ; s'arrête à la première erreur. */
      async remove(ids: readonly number[]): Promise<AppError | null> {
        // L'un après l'autre (une suppression attend la précédente) : arrêt à la première erreur.
        const error = await mutate(() => ids.reduce<Promise<void>>(
          (previous, id) => previous.then(() => deleteIgnoringMissing(id)),
          Promise.resolve(),
        ));
        if (error === null) {
          const removed = new Set(ids);
          patchState(store, { selectedIds: store.selectedIds().filter(id => !removed.has(id)) });
          resetPage();
        } else {
          // Une partie des morceaux a pu être supprimée avant l'échec : la liste est relue quand même.
          await load();
        }
        return error;
      },

      /**
       * Retire le morceau du tirage des prochains défis, ou l'y remet. Sans effet si une requête est
       * déjà en cours pour lui, ou pour désactiver un morceau du défi du jour (le bouton est grisé).
       */
      async toggleDisabled(track: PoolTrack): Promise<void> {
        const disable = !track.isDisabled;
        if (store.togglingIds().includes(track.id) || (disable && track.inTodayChallenge)) return;

        patchState(store, { togglingIds: [...store.togglingIds(), track.id], toggleError: null });
        const error = await mutate(() => api.setTrackDisabled(track.id, disable));
        patchState(store, {
          togglingIds: store.togglingIds().filter(id => id !== track.id),
          toggleError: toToggleError(error),
        });
      },
      dismissToggleError: () => patchState(store, { toggleError: null }),
    };
  }),
);

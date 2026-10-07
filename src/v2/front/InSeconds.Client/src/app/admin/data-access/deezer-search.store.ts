import { DestroyRef, inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, from, pipe, switchMap, tap, timer } from 'rxjs';
import { AppError, toAppError } from '../../core/errors/app-error';
import { DeezerResult } from '../domain/pool-track';
import { CatalogueApi } from './catalogue.api';
import { PoolStore } from './pool.store';

/** Avancement de l'ajout d'un résultat : chaque ligne a le sien (plusieurs ajouts peuvent se croiser). */
export type AddStatus = 'loading' | 'success' | 'error';

/** Une recherche plus courte n'interroge pas Deezer. */
export const MIN_QUERY_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 300;
const SUCCESS_RESET_MS = 2000;
const ERROR_RESET_MS = 3000;

interface DeezerSearchState {
  /** Le panneau de recherche et d'ajout est ouvert au-dessus du tableau du pool. */
  open: boolean;
  query: string;
  results: readonly DeezerResult[];
  searching: boolean;
  searchError: AppError | null;
  /** Liées, la saisie dans le filtre du pool et celle de la recherche Deezer se recopient l'une l'autre. */
  linked: boolean;
  addStatuses: Readonly<Record<number, AddStatus>>;
  /** Pourquoi l'ajout d'une ligne a échoué (doublon, Deezer indisponible…), pour l'infobulle du bouton. */
  addErrors: Readonly<Record<number, AppError>>;
}

/**
 * Le panneau de recherche et d'ajout de morceaux : recherche Deezer (attente de 300 ms après la
 * dernière frappe, une recherche en cours est annulée par la suivante), ajout d'un résultat au pool
 * sans fermer le panneau (pour en enchaîner plusieurs). La liaison avec le filtre du pool est
 * câblée par la page, qui connaît les deux.
 */
export const DeezerSearchStore = signalStore(
  withState<DeezerSearchState>({
    open: false, query: '', results: [], searching: false, searchError: null, linked: false, addStatuses: {}, addErrors: {},
  }),
  withMethods((store, api = inject(CatalogueApi), pool = inject(PoolStore), destroyRef = inject(DestroyRef)) => {
    const resetTimers = new Map<number, ReturnType<typeof setTimeout>>();
    destroyRef.onDestroy(() => resetTimers.forEach(clearTimeout));

    const setAddStatus = (deezerTrackId: number, status: AddStatus | null, error: AppError | null = null) => {
      const statuses = { ...store.addStatuses() };
      const errors = { ...store.addErrors() };
      if (status === null) delete statuses[deezerTrackId];
      else statuses[deezerTrackId] = status;
      if (error === null) delete errors[deezerTrackId];
      else errors[deezerTrackId] = error;
      patchState(store, { addStatuses: statuses, addErrors: errors });
    };

    /** Après un succès ou un échec, la ligne redevient « Ajouter » au bout de quelques secondes. */
    const scheduleReset = (deezerTrackId: number, expected: AddStatus, delay: number) => {
      clearTimeout(resetTimers.get(deezerTrackId));
      resetTimers.set(deezerTrackId, setTimeout(() => {
        if (store.addStatuses()[deezerTrackId] === expected) setAddStatus(deezerTrackId, null);
        resetTimers.delete(deezerTrackId);
      }, delay));
    };

    const search = rxMethod<string>(pipe(
      switchMap(query => {
        const text = query.trim();
        if (text.length < MIN_QUERY_LENGTH) {
          patchState(store, { results: [], searching: false, searchError: null });
          return EMPTY;
        }
        patchState(store, { searching: true });
        return timer(SEARCH_DEBOUNCE_MS).pipe(
          switchMap(() => from(api.searchDeezer(text).then(
            results => ({ results, error: null }),
            async error => ({ results: [] as DeezerResult[], error: await toAppError(error) }),
          ))),
          tap(({ results, error }) => patchState(store, { results, searching: false, searchError: error })),
        );
      }),
    ));

    return {
      setQuery(query: string): void {
        patchState(store, { query });
        search(query);
      },

      toggleLinked: () => patchState(store, { linked: !store.linked() }),

      /** Ouvre ou ferme le panneau ; fermé, il oublie la recherche, les résultats et l'avancement des ajouts. */
      toggleOpen(): void {
        const open = !store.open();
        if (open) {
          patchState(store, { open });
          return;
        }
        resetTimers.forEach(clearTimeout);
        resetTimers.clear();
        search('');
        patchState(store, { open, query: '', results: [], searching: false, searchError: null, addStatuses: {}, addErrors: {} });
      },

      /** Ajoute ce résultat au pool. Un doublon est refusé par l'API (409), l'avertissement reste non bloquant. */
      async add(deezerTrackId: number): Promise<void> {
        setAddStatus(deezerTrackId, 'loading');
        const error = await pool.add(deezerTrackId);
        setAddStatus(deezerTrackId, error === null ? 'success' : 'error', error);
        scheduleReset(deezerTrackId, error === null ? 'success' : 'error', error === null ? SUCCESS_RESET_MS : ERROR_RESET_MS);
      },
    };
  }),
);

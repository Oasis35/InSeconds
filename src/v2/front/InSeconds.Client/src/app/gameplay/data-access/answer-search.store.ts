import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, from, pipe, switchMap, tap, timer } from 'rxjs';
import {
  AnswerSuggestion, EMPTY_ANSWER_INPUT, MIN_QUERY_LENGTH, moveHighlight, resolveAnswer, suggestionLabel,
} from '../domain/answer';
import { AnswerSearchPort } from './answer-search.port';

export const SEARCH_DEBOUNCE_MS = 300;

interface AnswerSearchState {
  query: string;
  /** La proposition choisie dans la liste ; taper de nouveau l'efface. */
  selected: AnswerSuggestion | null;
  suggestions: readonly AnswerSuggestion[];
  /** -1 : aucune proposition en surbrillance. */
  highlighted: number;
  /** La liste est ouverte (fermée par Échap, par le choix d'une proposition ou en quittant le champ). */
  open: boolean;
}

const INITIAL: AnswerSearchState = { ...EMPTY_ANSWER_INPUT, suggestions: [], highlighted: -1, open: false };

/**
 * La saisie de la réponse et son autocomplete : attente de 300 ms après la dernière frappe, une
 * recherche en cours est annulée par la suivante, sous 2 caractères le catalogue n'est pas
 * interrogé, et un échec de recherche ne gêne pas la saisie (liste vide). Navigation au clavier :
 * ↓ ↑ en boucle, Entrée choisit la proposition en surbrillance, Échap ferme la liste.
 */
export const AnswerSearchStore = signalStore(
  withState<AnswerSearchState>(INITIAL),
  withComputed(({ query, selected, suggestions, open }) => ({
    answer: computed(() => resolveAnswer({ query: query(), selected: selected() })),
    visibleSuggestions: computed(() => (open() ? suggestions() : [])),
  })),
  withMethods((store, port = inject(AnswerSearchPort)) => {
    const search = rxMethod<string>(pipe(
      switchMap(text => {
        const trimmed = text.trim();
        if (trimmed.length < MIN_QUERY_LENGTH) {
          patchState(store, { suggestions: [], highlighted: -1 });
          return EMPTY;
        }
        return timer(SEARCH_DEBOUNCE_MS).pipe(
          switchMap(() => from(port.search(trimmed).catch((): AnswerSuggestion[] => []))),
          tap(suggestions => patchState(store, { suggestions, highlighted: -1 })),
        );
      }),
    ));

    const select = (suggestion: AnswerSuggestion) => {
      search(''); // une recherche en attente ne doit pas rouvrir une liste sur un champ déjà choisi
      patchState(store, { query: suggestionLabel(suggestion), selected: suggestion, open: false, highlighted: -1 });
    };

    return {
      setQuery(query: string): void {
        patchState(store, { query, selected: null, open: true });
        search(query);
      },

      select,

      /** Le bouton ✕ ou le morceau suivant : repart d'une saisie vide, liste fermée. */
      clear(): void {
        search('');
        patchState(store, INITIAL);
      },

      openList: (): void => patchState(store, { open: true }),
      close: (): void => patchState(store, { open: false, highlighted: -1 }),
      /** Le survol d'une proposition resynchronise la surbrillance du clavier. */
      highlight: (highlighted: number): void => patchState(store, { highlighted }),

      /** ↓ (`1`) ou ↑ (`-1`) ; sans liste visible, rien ne bouge. */
      moveHighlight(delta: 1 | -1): void {
        const count = store.visibleSuggestions().length;
        if (count > 0) patchState(store, { highlighted: moveHighlight(store.highlighted(), count, delta) });
      },

      /** Entrée : choisit la proposition en surbrillance. Rend `false` s'il n'y en a pas (la saisie se valide alors). */
      selectHighlighted(): boolean {
        const suggestion = store.visibleSuggestions()[store.highlighted()];
        if (!suggestion) return false;
        select(suggestion);
        return true;
      },
    };
  }),
);

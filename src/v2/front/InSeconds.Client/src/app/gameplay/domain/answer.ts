import { RoundAnswer } from './track-round';

/** Une proposition de l'autocomplete : un morceau du catalogue, jamais celui de la manche en cours. */
export interface AnswerSuggestion {
  readonly artist: string;
  readonly title: string;
}

/** La saisie : le texte tapé, et la proposition choisie dans la liste s'il y en a une. */
export interface AnswerInput {
  readonly query: string;
  readonly selected: AnswerSuggestion | null;
}

/** Une recherche plus courte n'interroge pas le catalogue. */
export const MIN_QUERY_LENGTH = 2;

export const EMPTY_ANSWER_INPUT: AnswerInput = { query: '', selected: null };

export const suggestionLabel = (suggestion: AnswerSuggestion): string => `${suggestion.artist} - ${suggestion.title}`;

/**
 * La réponse à envoyer. Une proposition choisie donne l'artiste et le titre tels quels ; sinon le
 * texte libre est coupé au premier « - » (l'artiste avant, le titre après, qui peut en contenir
 * d'autres). Un champ vide donne `null` des deux côtés.
 */
export function resolveAnswer(input: AnswerInput): RoundAnswer {
  if (input.selected) return { artist: clean(input.selected.artist), title: clean(input.selected.title) };
  if (!input.query.trim()) return { artist: null, title: null };
  const parts = input.query.split(' - ');
  return { artist: clean(parts[0]), title: clean(parts.slice(1).join(' - ')) };
}

const clean = (text: string | undefined): string | null => text?.trim() || null;

/** La surbrillance après ↓ (`1`) ou ↑ (`-1`) : en boucle, et depuis « aucune » ↓ va au premier, ↑ au dernier. */
export function moveHighlight(current: number, count: number, delta: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}

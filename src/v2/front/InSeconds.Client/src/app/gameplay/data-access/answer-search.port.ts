import { AnswerSuggestion } from '../domain/answer';

/**
 * Les propositions de l'autocomplete : des morceaux du catalogue dont l'artiste ou le titre ressemble
 * à la saisie. Elles sont publiques et ne disent rien du morceau de la manche.
 */
export abstract class AnswerSearchPort {
  abstract search(query: string): Promise<AnswerSuggestion[]>;
}

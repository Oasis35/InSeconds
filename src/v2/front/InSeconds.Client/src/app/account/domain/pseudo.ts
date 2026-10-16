/** Bornes et caractères du pseudo : les mêmes que le back (`VerifyMagicLinkValidator.PseudoPattern`). */
export const PSEUDO_MIN_LENGTH = 3;
export const PSEUDO_MAX_LENGTH = 20;
const PSEUDO_PATTERN = /^[\p{L}\p{N} _.-]+$/u;

export type PseudoIssue = 'required' | 'tooShort' | 'tooLong' | 'invalid';

/** Pseudo tel que l'envoie le front : sans espaces autour. */
export function normalizePseudo(raw: string): string {
  return raw.trim();
}

/**
 * Ce qui empêche d'enregistrer ce pseudo, ou `null`. Le back fait foi (il renvoie 400 sinon) ;
 * ce contrôle évite seulement un aller-retour pour une saisie manifestement fausse.
 */
export function pseudoIssue(raw: string): PseudoIssue | null {
  const pseudo = normalizePseudo(raw);
  if (pseudo.length === 0) return 'required';
  if (pseudo.length < PSEUDO_MIN_LENGTH) return 'tooShort';
  if (pseudo.length > PSEUDO_MAX_LENGTH) return 'tooLong';
  return PSEUDO_PATTERN.test(pseudo) ? null : 'invalid';
}

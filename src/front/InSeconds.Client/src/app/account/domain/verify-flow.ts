/**
 * Étapes de l'écran « confirmer la connexion » (`/account/login/verify`). Le lien magique ne
 * se consomme jamais au chargement de la page (piège 21 : les scanners d'e-mails pré-visitent
 * les liens) : un clic explicite sur « Confirmer » lance la vérification.
 */
export type PseudoProblem = 'none' | 'taken' | 'invalid';

/** Réponse de la vérification : `email` n'est donné que s'il faut créer le compte (`needsPseudo`). */
export interface MagicLinkVerification {
  readonly needsPseudo: boolean;
  readonly email: string | null;
}

export type VerifyStep =
  | { readonly kind: 'missing-token' }
  | { readonly kind: 'idle' }
  | { readonly kind: 'confirming' }
  /**
   * Aucun compte pour l'adresse du lien : le joueur choisit de le créer ou de revenir à la
   * connexion (« J'ai déjà un compte », faute de frappe ou autre adresse). Le jeton n'est pas consommé.
   */
  | { readonly kind: 'new-account'; readonly email: string | null }
  /** Le joueur a choisi de créer le compte : il lui faut un pseudo. */
  | { readonly kind: 'needs-pseudo'; readonly problem: PseudoProblem }
  /** Lien refusé (invalide, expiré, déjà utilisé). */
  | { readonly kind: 'invalid-link' }
  /** Autre échec (réseau, serveur) : le lien n'est pas forcément perdu, on peut réessayer. */
  | { readonly kind: 'failed' }
  | { readonly kind: 'done' };

/** Codes d'erreur de l'API qui changent le déroulement (cf. `PlayersErrorCodes` côté back). */
export const INVALID_LINK_CODE = 'players.invalid_or_expired_token';
export const PSEUDO_TAKEN_CODE = 'players.pseudo_taken';
export const BAD_REQUEST_CODE = 'common.bad_request';

export function initialVerifyStep(token: string | null): VerifyStep {
  return token ? { kind: 'idle' } : { kind: 'missing-token' };
}

export const confirming: VerifyStep = { kind: 'confirming' };

export function afterVerified({ needsPseudo, email }: MagicLinkVerification): VerifyStep {
  return needsPseudo ? { kind: 'new-account', email } : { kind: 'done' };
}

/** « Créer mon compte » : passe au choix du pseudo (seulement depuis « nouveau compte »). */
export function chooseNewAccount(step: VerifyStep): VerifyStep {
  return step.kind === 'new-account' ? { kind: 'needs-pseudo', problem: 'none' } : step;
}

/**
 * Étape suivante après un échec de la vérification. `pseudoSent` : la requête portait un pseudo
 * (le joueur est à l'étape du pseudo), donc un pseudo pris ou refusé le ramène à cette étape.
 */
export function afterFailure(code: string, pseudoSent: boolean): VerifyStep {
  if (code === INVALID_LINK_CODE) return { kind: 'invalid-link' };
  if (pseudoSent && code === PSEUDO_TAKEN_CODE) return { kind: 'needs-pseudo', problem: 'taken' };
  if (pseudoSent && code === BAD_REQUEST_CODE) return { kind: 'needs-pseudo', problem: 'invalid' };
  return { kind: 'failed' };
}

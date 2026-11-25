/**
 * Ce que la navigation vers la manche (`/daily`) porte quand le joueur a cliqué sur « Commencer » ou « Reprendre » : dans l'état du routeur
 * (`info`), jamais dans l'adresse. Il ne survit ni à un rechargement ni à un favori ni à un lien partagé : une partie ne part jamais sans clic.
 */
export const START_INTENT = { dailyStart: true } as const;

/** Vrai quand la navigation en cours porte l'intention de lancer la partie (voir `START_INTENT`). */
export function isStartIntent(info: unknown): boolean {
  return typeof info === 'object' && info !== null && (info as Record<string, unknown>)['dailyStart'] === true;
}

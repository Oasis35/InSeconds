import { InjectionToken } from '@angular/core';

/**
 * Lit si le défi du jour est joué (`true`), à jouer (`false`) ou inconnu (`null`), pour la coque : sur une arrivée directe sur la Setlist, la page du
 * jeu du jour n'a rien dit, et la barre du bas comme la fin de Setlist doivent pourtant rappeler le défi. Le jeu du jour le branche ; sans lui, inconnu.
 */
export const DAILY_DONE_LOADER = new InjectionToken<() => Promise<boolean | null>>('DAILY_DONE_LOADER', { factory: () => () => Promise.resolve(null) });

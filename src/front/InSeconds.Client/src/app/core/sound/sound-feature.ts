import { InjectionToken } from '@angular/core';

/**
 * Interrupteur des bruitages du jeu. Faux : aucun son ne joue, aucune cloche ni préférence n'est montrée, le reste du code est gardé tel quel.
 * Pour les rouvrir, passer la valeur par défaut à `true` ; les tests des sons la fournissent à `true` (`provideSoundsAvailable`).
 */
export const SOUNDS_AVAILABLE = new InjectionToken<boolean>('SOUNDS_AVAILABLE', { providedIn: 'root', factory: () => false });

/** Pour les tests : les bruitages sont présents dans cette version. */
export const provideSoundsAvailable = (available = true) => ({ provide: SOUNDS_AVAILABLE, useValue: available });

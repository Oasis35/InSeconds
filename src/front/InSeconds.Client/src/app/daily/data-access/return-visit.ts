import { Injectable, inject } from '@angular/core';
import { StoragePort } from '../../core/storage/storage.port';

/** Clé du stockage local : le dernier jour de jeu où l'accueil du défi a été ouvert. */
export const LAST_VISIT_DAY_KEY = 'inseconds.daily.lastVisitDay';

/**
 * Le joueur revient-il dans la journée ? À la première visite du jour, l'accueil accueille ; aux suivantes, il rappelle le défi qui reste
 * (« Il te reste le défi du jour · plus que 6 h »). Le jour de la dernière visite est noté dans le navigateur, rien d'autre.
 */
@Injectable()
export class ReturnVisit {
  private readonly storage = inject(StoragePort);

  /** `true` si l'accueil a déjà été ouvert ce jour-là ; note la visite. À appeler une fois par ouverture de la page. */
  check(today: string): boolean {
    const returning = this.storage.get(LAST_VISIT_DAY_KEY) === today;
    if (!returning) this.storage.set(LAST_VISIT_DAY_KEY, today);
    return returning;
  }
}

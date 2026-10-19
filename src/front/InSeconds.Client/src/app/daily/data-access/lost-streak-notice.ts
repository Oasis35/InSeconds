import { Injectable, inject } from '@angular/core';
import { StoragePort } from '../../core/storage/storage.port';
import { Streak, dateKey } from '../domain/streak';

/** Clé du stockage local : la date du dernier défi joué de la dernière série perdue déjà annoncée. */
export const LOST_STREAK_SEEN_KEY = 'inseconds.lostStreakNudgeSeen';

/**
 * Le toast invité « série perdue » ne s'annonce **qu'une fois par série perdue** : la série est repérée par la date du dernier défi
 * joué, notée dans le stockage local dès qu'elle est annoncée. Hors du `DailyGameStore` (§ 6.2 du plan v2 : le `localStorage` ne vit pas
 * dans les stores) : la page la consulte après la lecture de l'état du jour, comme `ThanksNotice`.
 */
@Injectable()
export class LostStreakNotice {
  private readonly storage = inject(StoragePort);

  /** La série perdue à annoncer maintenant (et notée comme annoncée), ou `null` : rien de perdu, ou déjà annoncée. */
  take(streak: Streak): number | null {
    const key = dateKey(streak.lastPlayedDate);
    if (streak.lostStreak === null || key === null) return null;
    if (this.storage.get(LOST_STREAK_SEEN_KEY) === key) return null;
    this.storage.set(LOST_STREAK_SEEN_KEY, key);
    return streak.lostStreak;
  }
}

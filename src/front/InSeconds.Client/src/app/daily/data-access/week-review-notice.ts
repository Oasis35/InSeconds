import { Injectable, inject } from '@angular/core';
import { StoragePort } from '../../core/storage/storage.port';

/** Clé du stockage local : le lundi de la semaine dont le joueur a fermé la carte de l'accueil. */
export const WEEK_REVIEW_DISMISSED_KEY = 'inseconds.weekReviewDismissed';

/** La fermeture de la carte « La semaine dernière » de l'accueil, gardée dans le navigateur (une semaine fermée ne revient pas). */
@Injectable({ providedIn: 'root' })
export class WeekReviewNotice {
  private readonly storage = inject(StoragePort);

  /** Le lundi de la dernière semaine fermée, ou `null`. */
  dismissedWeek(): string | null {
    const value = this.storage.get(WEEK_REVIEW_DISMISSED_KEY);
    return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }

  remember(weekStart: string): void {
    this.storage.set(WEEK_REVIEW_DISMISSED_KEY, weekStart);
  }
}

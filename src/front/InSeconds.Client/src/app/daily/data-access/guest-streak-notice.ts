import { Injectable, inject } from '@angular/core';
import { StoragePort } from '../../core/storage/storage.port';

/** Clé du stockage local : la série affichée quand l'invité a fermé le bandeau « crée un compte ». */
export const GUEST_STREAK_DISMISSED_KEY = 'inseconds.guestStreakToastDismissedAt';

/**
 * La fermeture du bandeau « crée un compte » d'un invité, gardée d'une visite à l'autre (les règles d'affichage sont dans
 * `domain/toasts`). Hors du `DailyGameStore` (le `localStorage` ne vit pas dans les stores) : la page la relit au chargement et
 * l'écrit à la fermeture, comme `LostStreakNotice`.
 */
@Injectable()
export class GuestStreakNotice {
  private readonly storage = inject(StoragePort);

  /** La série affichée à la dernière fermeture, ou `null` : jamais fermé (ou valeur illisible). */
  dismissedAt(): number | null {
    const value = Number.parseInt(this.storage.get(GUEST_STREAK_DISMISSED_KEY) ?? '', 10);
    return Number.isNaN(value) ? null : value;
  }

  remember(streak: number): void {
    this.storage.set(GUEST_STREAK_DISMISSED_KEY, String(streak));
  }
}

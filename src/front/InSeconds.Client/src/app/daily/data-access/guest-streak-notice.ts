import { Injectable, inject } from '@angular/core';
import { StoragePort } from '../../core/storage/storage.port';
import { GuestTileDismissal } from '../domain/toasts';

/** Clé du stockage local : le jour et la série affichée quand l'invité a fermé la tuile « crée un compte ». */
export const GUEST_TILE_DISMISSED_KEY = 'inseconds.guestAccountTile';

/**
 * La fermeture de la tuile « crée un compte » d'un invité, gardée d'une visite à l'autre (les règles d'affichage sont dans
 * `domain/toasts`). Hors du `HomeStore` (le `localStorage` ne vit pas dans les stores) : la page la relit au chargement et
 * l'écrit à la fermeture, comme `LostStreakNotice`.
 */
@Injectable()
export class GuestStreakNotice {
  private readonly storage = inject(StoragePort);

  /** La dernière fermeture, ou `null` : jamais fermée (ou valeur illisible). */
  dismissed(): GuestTileDismissal | null {
    try {
      const value: unknown = JSON.parse(this.storage.get(GUEST_TILE_DISMISSED_KEY) ?? 'null');
      if (typeof value !== 'object' || value === null) return null;
      const { day, streak } = value as { day?: unknown; streak?: unknown };
      return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && typeof streak === 'number' && Number.isFinite(streak) ? { day, streak } : null;
    } catch {
      return null;
    }
  }

  remember(dismissal: GuestTileDismissal): void {
    this.storage.set(GUEST_TILE_DISMISSED_KEY, JSON.stringify(dismissal));
  }
}

import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DailyClient } from '../../api/daily/api.generated';

/**
 * Adaptateur des actions de l'admin sur le jeu du jour (`api/daily`) : seule porte d'entrée vers le
 * client généré. Les erreurs sont celles du client (`toAppError` sait les lire).
 */
@Injectable({ providedIn: 'root' })
export class ActionsApi {
  private readonly client = inject(DailyClient);

  /** Délai de réutilisation des morceaux, en jours. */
  async getCooldownDays(): Promise<number> {
    return (await firstValueFrom(this.client.getAdminDailySettings())).trackCooldownDays;
  }

  /** Enregistre le délai ; rend la valeur retenue par l'API. */
  async updateCooldownDays(trackCooldownDays: number): Promise<number> {
    return (await firstValueFrom(this.client.updateTrackCooldown({ trackCooldownDays }))).trackCooldownDays;
  }
}

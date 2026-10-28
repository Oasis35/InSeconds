import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminDailySettingsResponse, DailyClient } from '../../api/daily/api.generated';
import { CooldownSettings } from '../domain/actions';

function toCooldown(response: AdminDailySettingsResponse): CooldownSettings {
  return { poolPercent: response.trackCooldownPoolPercent, days: response.trackCooldownDays, playableCount: response.playableTrackCount };
}

/**
 * Adaptateur des actions de l'admin sur le jeu du jour (`api/daily`) : seule porte d'entrée vers le
 * client généré. Les erreurs sont celles du client (`toAppError` sait les lire).
 */
@Injectable()
export class ActionsApi {
  private readonly client = inject(DailyClient);

  /** Le cooldown des morceaux en vigueur : la part du pool réglée, et les jours qu'elle donne sur le pool d'aujourd'hui. */
  async getCooldown(): Promise<CooldownSettings> {
    return toCooldown(await firstValueFrom(this.client.getAdminDailySettings()));
  }

  /** Enregistre la part du pool en cooldown ; rend le cooldown qui en résulte. */
  async updateCooldownPercent(trackCooldownPoolPercent: number): Promise<CooldownSettings> {
    return toCooldown(await firstValueFrom(this.client.updateTrackCooldownPoolPercent({ trackCooldownPoolPercent })));
  }
}

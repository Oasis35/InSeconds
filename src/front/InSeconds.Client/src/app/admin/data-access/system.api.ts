import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminClient } from '../../api/admin/api.generated';
import { SystemInfo } from '../domain/system';

/** Adaptateur de l'état de l'API (`GET /api/admin/system`) : seule porte d'entrée vers le client généré. */
@Injectable()
export class SystemApi {
  private readonly client = inject(AdminClient);

  /** Le commit de l'API et la dernière sauvegarde de la base. */
  async getInfo(): Promise<SystemInfo> {
    const response = await firstValueFrom(this.client.getSystemInfo());
    return {
      commit: response.commit ?? null,
      lastBackupAt: toInstant(response.lastBackupAt),
      lastBackupOffSite: response.lastBackupOffSite ?? null,
    };
  }
}

/** Le client annonce un `Date`, le JSON livre un texte ISO avec fuseau : on le garde tel quel. */
function toInstant(value: Date | string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminClient } from '../../api/admin/api.generated';
import { CatalogueClient } from '../../api/catalogue/api.generated';
import { DailyClient } from '../../api/daily/api.generated';
import { BackupFailureResponse } from '../../api/admin/api.generated';
import { BackupFailure, CatalogueHealth, NextChallenge, SystemInfo } from '../domain/system';

/**
 * Adaptateur du panneau technique : l'état de l'API (`GET /api/admin/system`), celui du pool (`GET /api/admin/catalogue/health`) et le
 * défi de demain (`GET /api/admin/daily/next-challenge`). Seule porte d'entrée vers les clients générés pour ces routes.
 */
@Injectable()
export class SystemApi {
  private readonly client = inject(AdminClient);
  private readonly catalogue = inject(CatalogueClient);
  private readonly daily = inject(DailyClient);

  /** Le commit de l'API, la dernière sauvegarde de la base et son dernier contrôle de restauration. */
  async getInfo(): Promise<SystemInfo> {
    const response = await firstValueFrom(this.client.getSystemInfo());
    return {
      commit: response.commit ?? null,
      lastBackupAt: toInstant(response.lastBackupAt),
      lastBackupOffSite: response.lastBackupOffSite ?? null,
      backupFailure: toFailure(response.backupFailure),
      lastRestoreTestAt: toInstant(response.lastRestoreTestAt),
      restoreTestFailure: toFailure(response.restoreTestFailure),
    };
  }

  /** Les morceaux actifs sans extrait, et sans forme d'onde. */
  async getCatalogueHealth(): Promise<CatalogueHealth> {
    const response = await firstValueFrom(this.catalogue.getCatalogueHealth());
    return { missingPreviewCount: response.missingPreviewCount, missingWaveformCount: response.missingWaveformCount };
  }

  /** Ce que le tirage du défi de demain trouverait maintenant. */
  async getNextChallenge(): Promise<NextChallenge> {
    const response = await firstValueFrom(this.daily.getNextChallenge());
    const date = response.date as Date | string;
    return {
      date: (typeof date === 'string' ? date : date.toISOString()).slice(0, 10),
      eligibleCount: response.eligibleCount,
      requiredCount: response.requiredCount,
      generated: response.generated,
    };
  }
}

/** Le client annonce un `Date`, le JSON livre un texte ISO avec fuseau : on le garde tel quel. */
function toInstant(value: Date | string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

function toFailure(value: BackupFailureResponse | undefined | null): BackupFailure | null {
  if (!value) return null;
  return { at: toInstant(value.at) ?? '', step: value.step ?? null, message: value.message ?? null };
}

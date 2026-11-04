import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminClient } from '../../api/admin/api.generated';
import { CatalogueClient } from '../../api/catalogue/api.generated';
import { DailyClient } from '../../api/daily/api.generated';
import { SystemApi } from './system.api';

describe('SystemApi', () => {
  const client = { getSystemInfo: vi.fn() };
  const catalogue = { getCatalogueHealth: vi.fn() };
  const daily = { getNextChallenge: vi.fn() };
  let api: SystemApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SystemApi, { provide: AdminClient, useValue: client }, { provide: CatalogueClient, useValue: catalogue }, { provide: DailyClient, useValue: daily },
      ],
    });
    api = TestBed.inject(SystemApi);
  });

  it('rend le commit de l\'API et la dernière sauvegarde, instant en texte ISO', async () => {
    client.getSystemInfo.mockReturnValue(of({ commit: 'abc1234', lastBackupAt: new Date('2026-11-04T03:00:41Z'), lastBackupOffSite: true }));

    expect(await api.getInfo()).toEqual({ commit: 'abc1234', lastBackupAt: '2026-11-04T03:00:41.000Z', lastBackupOffSite: true });
  });

  it('hors image de prod et sans sauvegarde : tout est vide', async () => {
    client.getSystemInfo.mockReturnValue(of({ commit: undefined, lastBackupAt: undefined, lastBackupOffSite: undefined }));

    expect(await api.getInfo()).toEqual({ commit: null, lastBackupAt: null, lastBackupOffSite: null });
  });

  it('rend l\'état du pool', async () => {
    catalogue.getCatalogueHealth.mockReturnValue(of({ missingPreviewCount: 3, missingWaveformCount: 0 }));

    expect(await api.getCatalogueHealth()).toEqual({ missingPreviewCount: 3, missingWaveformCount: 0 });
  });

  it('rend le défi de demain, jour en texte', async () => {
    daily.getNextChallenge.mockReturnValue(of({ date: '2026-11-05', eligibleCount: 212, requiredCount: 5, generated: false }));

    expect(await api.getNextChallenge()).toEqual({ date: '2026-11-05', eligibleCount: 212, requiredCount: 5, generated: false });
  });
});

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminClient } from '../../api/admin/api.generated';
import { SystemApi } from './system.api';

describe('SystemApi', () => {
  const client = { getSystemInfo: vi.fn() };
  let api: SystemApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [SystemApi, { provide: AdminClient, useValue: client }] });
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
});

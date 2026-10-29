import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DailyClient } from '../../api/daily/api.generated';
import { ActionsApi } from './actions.api';

describe('ActionsApi', () => {
  const client = {
    getAdminDailySettings: vi.fn(() => of({ trackCooldownPoolPercent: 75, trackCooldownDays: 120, playableTrackCount: 800 })),
    updateTrackCooldownPoolPercent: vi.fn((body: { trackCooldownPoolPercent: number }) =>
      of({ trackCooldownPoolPercent: body.trackCooldownPoolPercent, trackCooldownDays: 80, playableTrackCount: 800 })),
  };
  let api: ActionsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ActionsApi, { provide: DailyClient, useValue: client }] });
    api = TestBed.inject(ActionsApi);
  });

  it('lit le cooldown en vigueur', async () => {
    expect(await api.getCooldown()).toEqual({ poolPercent: 75, days: 120, playableCount: 800 });
  });

  it('enregistre la part du pool et rend le cooldown qui en résulte', async () => {
    expect(await api.updateCooldownPercent(50)).toEqual({ poolPercent: 50, days: 80, playableCount: 800 });
    expect(client.updateTrackCooldownPoolPercent).toHaveBeenCalledWith({ trackCooldownPoolPercent: 50 });
  });
});

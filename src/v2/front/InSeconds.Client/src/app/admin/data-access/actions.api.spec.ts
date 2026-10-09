import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DailyClient } from '../../api/daily/api.generated';
import { ActionsApi } from './actions.api';

describe('ActionsApi', () => {
  const client = {
    getAdminDailySettings: vi.fn(() => of({ trackCooldownDays: 30 })),
    updateTrackCooldown: vi.fn((body: { trackCooldownDays: number }) => of({ trackCooldownDays: body.trackCooldownDays })),
  };
  let api: ActionsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: DailyClient, useValue: client }] });
    api = TestBed.inject(ActionsApi);
  });

  it('lit et enregistre le délai', async () => {
    expect(await api.getCooldownDays()).toBe(30);
    expect(await api.updateCooldownDays(45)).toBe(45);
    expect(client.updateTrackCooldown).toHaveBeenCalledWith({ trackCooldownDays: 45 });
  });
});

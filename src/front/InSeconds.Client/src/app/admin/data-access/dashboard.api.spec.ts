import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DailyClient, DashboardResponse } from '../../api/daily/api.generated';
import { DashboardApi } from './dashboard.api';

describe('DashboardApi', () => {
  // Le JSON livre des jours en texte alors que le client les annonce en Date.
  const response = {
    dailyActivity: [{ date: '2026-10-04', playerCount: 3 }],
    playerBreakdown: { totalGuests: 5, totalRegistered: 2, activeLast7Days: 4, activeLast30Days: 6 },
    availableDates: ['2026-10-05', '2026-10-04'],
    selectedDayKpis: {
      date: '2026-10-05', completedCount: 3, abandonedCount: 1, expiredCount: 0, pendingCount: 0,
      totalSessions: 4, completionRate: 75, medianScore: 4200,
    },
  } as unknown as DashboardResponse;

  function setup(result: DashboardResponse) {
    const client = { getDashboard: vi.fn(() => of(result)) };
    TestBed.configureTestingModule({ providers: [{ provide: DailyClient, useValue: client }] });
    return { client, api: TestBed.inject(DashboardApi) };
  }

  it('convertit la réponse en types du domaine, jours en texte', async () => {
    const { api } = setup(response);

    const dashboard = await api.getDashboard('2026-10-05');

    expect(dashboard.activity).toEqual([{ day: '2026-10-04', playerCount: 3 }]);
    expect(dashboard.availableDays).toEqual(['2026-10-05', '2026-10-04']);
    expect(dashboard.kpis).toEqual({
      day: '2026-10-05', completedCount: 3, abandonedCount: 1, expiredCount: 0, pendingCount: 0,
      totalSessions: 4, completionRate: 75, medianScore: 4200,
    });
    expect(dashboard.players.totalGuests).toBe(5);
  });

  it('passe le jour demandé, ou rien pour aujourd\'hui', async () => {
    const { api, client } = setup(response);

    await api.getDashboard();
    await api.getDashboard('2026-10-04');

    expect(client.getDashboard).toHaveBeenNthCalledWith(1, undefined);
    expect(client.getDashboard).toHaveBeenNthCalledWith(2, '2026-10-04');
  });

  it('un jour sans défi : pas de KPI ; score médian absent : null', async () => {
    const { api } = setup({ ...response, selectedDayKpis: undefined } as DashboardResponse);
    expect((await api.getDashboard()).kpis).toBeNull();
  });

  it('un score médian absent devient null', async () => {
    const kpis = { ...(response.selectedDayKpis as object), medianScore: undefined };
    const { api } = setup({ ...response, selectedDayKpis: kpis } as DashboardResponse);
    expect((await api.getDashboard()).kpis?.medianScore).toBeNull();
  });
});

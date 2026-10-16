import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DailyClient, WeeklyRecapResponse } from '../../api/daily/api.generated';
import { WeeklyStoryApi } from './weekly-story.api';

describe('WeeklyStoryApi', () => {
  function setup(response: Partial<WeeklyRecapResponse>) {
    const client = {
      getWeeklyRecap: vi.fn(() => of({
        status: 'ok', from: '2026-09-21', to: '2026-09-27', minAnswers: 3, mostFound: undefined, mostMissed: undefined, ...response,
      } as unknown as WeeklyRecapResponse)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: DailyClient, useValue: client }] });
    return { client, api: TestBed.inject(WeeklyStoryApi) };
  }

  it('envoie la période et rend un récap du domaine, jours en texte, morceaux absents à null', async () => {
    const { client, api } = setup({
      mostFound: { artist: 'Daft Punk', title: 'One More Time', successRatePercent: 87, answers: 23 },
    });

    const recap = await api.getRecap('2026-09-21', '2026-09-27');

    expect(client.getWeeklyRecap).toHaveBeenCalledWith('2026-09-21', '2026-09-27');
    expect(recap).toEqual({
      status: 'ok', from: '2026-09-21', to: '2026-09-27', minAnswers: 3,
      mostFound: { artist: 'Daft Punk', title: 'One More Time', successRatePercent: 87, answers: 23 },
      mostMissed: null,
    });
  });

  it('garde le jour même si le client livre un Date, et ramène tout statut inconnu à « insuffisant »', async () => {
    const { api } = setup({
      status: 'insufficient_data', from: new Date('2026-09-21T00:00:00Z'), to: new Date('2026-09-27T00:00:00Z'),
    });

    const recap = await api.getRecap('2026-09-21', '2026-09-27');

    expect(recap.status).toBe('insufficient');
    expect(recap.from).toBe('2026-09-21');
    expect(recap.to).toBe('2026-09-27');
  });
});

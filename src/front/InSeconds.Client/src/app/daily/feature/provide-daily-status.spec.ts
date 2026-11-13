import { TestBed } from '@angular/core/testing';
import { DAILY_DONE_LOADER } from '../../core/shell/daily-done-loader';
import { DailyApi } from '../data-access/daily.api';
import { provideDailyStatus } from './provide-daily-status';

describe('provideDailyStatus', () => {
  const cases: [string, boolean | null][] = [
    ['already_played', true],
    ['abandoned', true],
    ['can_start', false],
    ['resumable', false],
    ['other', null],
  ];

  it.each(cases)('l\'état %s donne %s', async (state, expected) => {
    const today = vi.spyOn(DailyApi.prototype, 'today').mockResolvedValue({ state } as never);
    TestBed.configureTestingModule({ providers: [provideDailyStatus()] });
    const loader = TestBed.inject(DAILY_DONE_LOADER);

    expect(await loader()).toBe(expected);
    today.mockRestore();
  });
});

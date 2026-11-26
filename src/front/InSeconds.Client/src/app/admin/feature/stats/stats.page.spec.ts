import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { settle } from '../../../account/feature/testing/dom';
import { fakeStatsApi, provideStatsApiFake } from '../../data-access/testing/fake-stats-api';
import { StatsPage } from './stats.page';

describe('StatsPage', () => {
  async function setup(api = fakeStatsApi()) {
    TestBed.configureTestingModule({ imports: [StatsPage], providers: [provideStatsApiFake(api), provideTranslateService()] });
    const fixture = TestBed.createComponent(StatsPage);
    await settle(fixture);
    return { api, fixture, element: fixture.nativeElement as HTMLElement };
  }

  const byId = (e: HTMLElement, id: string) => e.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  it('charge 30 jours et montre les blocs', async () => {
    const { api, element } = await setup();
    expect(api.getStats).toHaveBeenCalledWith(30);
    for (const id of ['dashboard-arrivals', 'stats-sources', 'stats-devices', 'stats-regulars', 'stats-games', 'stats-answers']) {
      expect(byId(element, id), id).not.toBeNull();
    }
    expect(byId(element, 'stats-games')!.textContent).toContain('3100');
  });

  it('un clic sur 7 jours relit la période', async () => {
    const { api, fixture, element } = await setup();
    byId(element, 'period-7')!.click();
    await settle(fixture);
    expect(api.getStats).toHaveBeenLastCalledWith(7);
  });
});

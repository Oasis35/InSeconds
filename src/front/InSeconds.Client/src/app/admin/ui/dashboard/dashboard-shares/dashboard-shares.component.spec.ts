import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DashboardSharesComponent } from './dashboard-shares.component';

describe('DashboardSharesComponent', () => {
  function render(dayArrivals = [{ source: 'share', count: 1 }], arrivals = [{ source: 'share', count: 2 }, { source: 'direct', count: 9 }]) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DashboardSharesComponent);
    fixture.componentRef.setInput('shares', { selectedDay: { short: 3, long: 1 }, last30Days: { short: 40, long: 12 } });
    fixture.componentRef.setInput('dayArrivals', dayArrivals);
    fixture.componentRef.setInput('arrivals', arrivals);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return (id: string) => el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();
  }

  it('les partages faits, le jour affiché et sur 30 jours (anciens formats additionnés)', () => {
    const value = render();
    expect([value('shares-count-day'), value('shares-count-30')]).toEqual(['4', '52']);
  });

  it('les amis venus par le lien, lus dans la source d arrivée share', () => {
    const value = render();
    expect([value('shares-friends-day'), value('shares-friends-30')]).toEqual(['1', '2']);
  });

  it('un jour sans défi (aucune arrivée lue) : zéro ami venu ce jour-là', () => {
    TestBed.resetTestingModule();
    const value = render([]);
    expect(value('shares-friends-day')).toBe('0');
  });
});

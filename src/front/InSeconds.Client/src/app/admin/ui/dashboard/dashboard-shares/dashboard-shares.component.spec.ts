import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DashboardSharesComponent } from './dashboard-shares.component';

describe('DashboardSharesComponent', () => {
  function render(dayArrivals = [{ source: 'share', count: 1 }], arrivals = [{ source: 'share-long', count: 4 }, { source: 'share', count: 2 }, { source: 'direct', count: 9 }]) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DashboardSharesComponent);
    fixture.componentRef.setInput('shares', { selectedDay: { short: 3, long: 1 }, last30Days: { short: 40, long: 12 } });
    fixture.componentRef.setInput('dayArrivals', dayArrivals);
    fixture.componentRef.setInput('arrivals', arrivals);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return (id: string) => el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();
  }

  it('les partages faits par format, le jour affiché et sur 30 jours', () => {
    const value = render();
    expect([value('shares-short-day'), value('shares-short-30')]).toEqual(['3', '40']);
    expect([value('shares-long-day'), value('shares-long-30')]).toEqual(['1', '12']);
  });

  it('les amis venus par chaque lien, lus dans les sources d arrivée share et share-long', () => {
    const value = render();
    expect([value('shares-friends-short-day'), value('shares-friends-short-30')]).toEqual(['1', '2']);
    expect([value('shares-friends-long-day'), value('shares-friends-long-30')]).toEqual(['0', '4']);
  });

  it('un jour sans défi (aucune arrivée lue) : zéro ami venu ce jour-là', () => {
    TestBed.resetTestingModule();
    const value = render([]);
    expect([value('shares-friends-short-day'), value('shares-friends-long-day')]).toEqual(['0', '0']);
  });
});

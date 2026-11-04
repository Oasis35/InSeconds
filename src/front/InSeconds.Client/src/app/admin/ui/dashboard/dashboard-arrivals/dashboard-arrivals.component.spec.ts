import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ArrivalCount } from '../../../domain/dashboard';
import { DashboardArrivalsComponent } from './dashboard-arrivals.component';

describe('DashboardArrivalsComponent', () => {
  function render(arrivals: ArrivalCount[]) {
    TestBed.configureTestingModule({ imports: [DashboardArrivalsComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DashboardArrivalsComponent);
    fixture.componentRef.setInput('arrivals', arrivals);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('montre le total, les trois sources les plus fréquentes et le reste réuni, en pourcentages', () => {
    const element = render([
      { source: 'instagram', count: 5 }, { source: 'share', count: 2 }, { source: 'google.com', count: 1 },
      { source: 'direct', count: 1 }, { source: 'other', count: 1 },
    ]);

    expect(element.textContent).toContain('10');
    const legend = Array.from(element.querySelectorAll('[data-testid="arrival-share"]')).map(e => e.textContent!.replace(/\s+/g, ' ').trim());
    expect(legend).toEqual(['admin.sources.instagram 50 %', 'admin.sources.share 20 %', 'google.com 10 %', 'admin.sources.rest 20 %']);
  });

  it('rien sans arrivée', () => {
    expect(render([]).querySelector('[data-testid="dashboard-arrivals"]')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EAR_PROFILE } from '../../data-access/testing/fake-daily-api';
import { EarProfileChartComponent } from './ear-profile-chart.component';

describe('EarProfileChartComponent', () => {
  function render(points = EAR_PROFILE().points) {
    TestBed.configureTestingModule({ imports: [EarProfileChartComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(EarProfileChartComponent);
    fixture.componentRef.setInput('points', points);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('trace sa courbe et celle des joueurs, avec un point sur la dernière semaine', () => {
    const el = render();

    expect(el.querySelectorAll('polyline')).toHaveLength(3);
  });

  it('sans aucune valeur, rien', () => {
    const el = render([{ start: '2026-11-16', average: null, playersAverage: null, games: 0 }]);

    expect(el.querySelector('svg')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { StatsDayBarsComponent } from './stats-day-bars.component';

describe('StatsDayBarsComponent', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [StatsDayBarsComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(StatsDayBarsComponent);
    fixture.componentRef.setInput('bars', [{ day: '2026-11-24', parts: [2, 2] }, { day: '2026-11-25', parts: [1, 0] }]);
    fixture.componentRef.setInput('legend', [{ labelKey: 'a', color: 'var(--color-success)' }, { labelKey: 'b', color: 'var(--color-fail)' }]);
    fixture.componentRef.setInput('ariaLabel', 'x');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('une barre par jour, la plus haute remplit la hauteur, bornes en jj/mm', () => {
    const element = render();
    const bars = Array.from(element.querySelectorAll<HTMLElement>('[data-testid="day-bar"]'));
    expect(bars).toHaveLength(2);
    expect(bars[0].style.height).toBe('100%');
    expect(bars[1].style.height).toBe('25%');
    expect(element.textContent).toContain('24/11');
    expect(element.textContent).toContain('25/11');
  });
});

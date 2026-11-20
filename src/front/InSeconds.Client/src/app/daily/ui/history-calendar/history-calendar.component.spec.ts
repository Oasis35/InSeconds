import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { HISTORY } from '../../data-access/testing/fake-daily-api';
import { HistoryCalendarComponent } from './history-calendar.component';

describe('HistoryCalendarComponent', () => {
  function render(history = HISTORY()) {
    TestBed.configureTestingModule({ imports: [HistoryCalendarComponent], providers: [provideRouter([]), provideTranslateService()] });
    const fixture = TestBed.createComponent(HistoryCalendarComponent);
    fixture.componentRef.setInput('history', history);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('une case par jour du mois, chaque jour de défi mène à ses réponses ou au défi', () => {
    const el = render();

    expect(el.querySelectorAll('.day')).toHaveLength(30);
    expect(el.querySelector('[data-testid="history-day-2026-11-19"]')?.getAttribute('href')).toBe('/history/daily/2026-11-19');
    expect(el.querySelector('[data-testid="history-day-2026-11-18"]')?.getAttribute('data-state')).toBe('missed');
    expect(el.querySelector('[data-testid="history-day-2026-11-20"]')?.getAttribute('href')).toBe('/daily');
    // Un jour sans défi n'est pas un lien.
    expect(el.querySelector('[data-testid="history-day-2026-11-01"]')).toBeNull();
  });

  it('une case jouée est teintée selon son score', () => {
    const el = render();

    const played = el.querySelector<HTMLElement>('[data-testid="history-day-2026-11-19"]')!;
    expect(played.style.background).toContain('rgb(var(--rgb-accent-3)');
  });

  it('les chiffres du mois', () => {
    const el = render();

    expect(el.querySelector('[data-testid="history-month-played"]')?.textContent).toContain('1');
    expect(el.querySelector('[data-testid="history-month-played"]')?.textContent).toContain('/ 2');
    expect(el.querySelector('[data-testid="history-month-best"]')?.textContent?.replace(/\s/g, '')).toBe('2140');
  });
});

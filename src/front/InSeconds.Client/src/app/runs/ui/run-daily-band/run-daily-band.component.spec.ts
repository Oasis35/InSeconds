import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunDailyBandComponent, clockText, msUntilNextUtcMidnight } from './run-daily-band.component';

describe('RunDailyBandComponent', () => {
  function render(pending: boolean | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunDailyBandComponent);
    fixture.componentRef.setInput('pending', pending);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('défi à jouer : la carte cyan mène au jeu du jour', () => {
    const el = render(true);
    expect(el.querySelector('[data-testid="daily-left"]')?.getAttribute('href')).toBe('/daily');
    expect(el.textContent).toContain('runs.v4.band.title');
    expect(el.querySelector('[data-testid="daily-done-band"]')).toBeNull();
  });

  it('défi joué : une ligne discrète avec le compte à rebours', () => {
    const el = render(false);
    expect(el.querySelector('[data-testid="daily-left"]')).toBeNull();
    expect(el.querySelector('[data-testid="daily-done-band"]')?.textContent).toMatch(/\d\d:\d\d:\d\d/);
  });

  it('défi inconnu : rien', () => {
    expect(render(null).querySelector('[data-testid="daily-left"], [data-testid="daily-done-band"]')).toBeNull();
  });

  it('le temps jusqu’à minuit UTC', () => {
    expect(msUntilNextUtcMidnight(Date.UTC(2026, 10, 13, 17, 47, 20))).toBe((6 * 3600 + 12 * 60 + 40) * 1000);
    expect(clockText((6 * 3600 + 12 * 60 + 40) * 1000)).toBe('06:12:40');
  });
});

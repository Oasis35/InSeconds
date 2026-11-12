import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { HistorySummaryComponent } from './history-summary.component';
import { HistoryTabsComponent } from './history-tabs.component';
import { MonthNavComponent } from './month-nav.component';

describe("pièces communes de l'historique", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] }));

  it("les onglets sont des liens vers la page de chaque mode, l'actif est annoncé", () => {
    const fixture = TestBed.createComponent(HistoryTabsComponent);
    fixture.componentRef.setInput('active', 'setlist');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="history-tab-daily"]')?.getAttribute('href')).toBe('/daily/history');
    expect(el.querySelector('[data-testid="history-tab-daily"]')?.getAttribute('aria-current')).toBeNull();
    expect(el.querySelector('[data-testid="history-tab-setlist"]')?.getAttribute('href')).toBe('/setlist/history');
    expect(el.querySelector('[data-testid="history-tab-setlist"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('le résumé écrit les scores dans la langue, un point médian sans partie', () => {
    const fixture = TestBed.createComponent(HistorySummaryComponent);
    for (const [k, v] of Object.entries({ countKey: 'c', bestKey: 'b', count: 58, average: 2050, best: null, locale: 'en' })) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="history-count"]')?.textContent).toBe('58');
    expect(el.querySelector('[data-testid="history-average"]')?.textContent).toBe('2,050');
    expect(el.querySelector('[data-testid="history-best"]')?.textContent).toBe('·');
  });

  it('les flèches du mois sont des liens, éteintes quand il n’y a rien de ce côté', () => {
    const fixture = TestBed.createComponent(MonthNavComponent);
    fixture.componentRef.setInput('month', '2026-11');
    fixture.componentRef.setInput('previous', '2026-09');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="month-label"]')?.textContent).toBe('Novembre 2026');
    expect(el.querySelector('[data-testid="month-previous"]')?.getAttribute('href')).toBe('/?mois=2026-09');
    expect(el.querySelector('[data-testid="month-next"]')).toBeNull();
  });
});

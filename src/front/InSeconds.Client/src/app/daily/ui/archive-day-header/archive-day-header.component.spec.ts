import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ArchiveDayHeaderComponent } from './archive-day-header.component';

describe('ArchiveDayHeaderComponent', () => {
  function render(inputs: Partial<{ date: string; previousDate: string | null; nextDate: string | null; lang: 'fr' | 'en' }> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService()] });
    const fixture = TestBed.createComponent(ArchiveDayHeaderComponent);
    fixture.componentRef.setInput('date', inputs.date ?? '2026-11-19');
    if (inputs.previousDate !== undefined) fixture.componentRef.setInput('previousDate', inputs.previousDate);
    if (inputs.nextDate !== undefined) fixture.componentRef.setInput('nextDate', inputs.nextDate);
    if (inputs.lang !== undefined) fixture.componentRef.setInput('lang', inputs.lang);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const byTestId = (id: string) => element.querySelector<HTMLAnchorElement>(`[data-testid="${id}"]`);
    return { element, byTestId, title: () => byTestId('archive-date')!, offArrows: () => Array.from(element.querySelectorAll('.nav--off')) };
  }

  it('le titre est un h1 : « Réponses du » puis la date en toutes lettres', () => {
    const { title } = render({ date: '2026-11-19' });

    expect(title().tagName).toBe('H1');
    expect(title().textContent).toContain('daily.archive.titlePrefix');
    expect(title().textContent).toContain('19');
    expect(title().textContent!.toLowerCase()).toContain('novembre');
    expect(title().textContent).toContain('2026');
  });

  it('la date suit la langue demandée', () => {
    expect(render({ date: '2026-11-19', lang: 'en' }).title().textContent!.toLowerCase()).toContain('november');
    expect(render({ date: '2026-11-19', lang: 'fr' }).title().textContent!.toLowerCase()).toContain('novembre');
  });

  it('un jour d\'avant et un jour d\'après sont de vrais liens, vers la page de ce jour', () => {
    const { byTestId } = render({ previousDate: '2026-11-18', nextDate: '2026-11-20' });

    expect(byTestId('archive-previous')!.tagName).toBe('A');
    expect(byTestId('archive-previous')!.getAttribute('href')).toBe('/history/daily/2026-11-18');
    expect(byTestId('archive-next')!.getAttribute('href')).toBe('/history/daily/2026-11-20');
  });

  it('les liens sont nommés pour les lecteurs d\'écran', () => {
    const { byTestId } = render({ previousDate: '2026-11-18', nextDate: '2026-11-20' });

    expect(byTestId('archive-previous')!.getAttribute('aria-label')).toBe('daily.archive.previousDay');
    expect(byTestId('archive-next')!.getAttribute('aria-label')).toBe('daily.archive.nextDay');
  });

  it('sans jour d\'avant, la flèche reste à sa place, éteinte et sans lien', () => {
    const { byTestId, offArrows } = render({ previousDate: null, nextDate: '2026-11-20' });

    expect(byTestId('archive-previous')).toBeNull();
    expect(byTestId('archive-next')).not.toBeNull();
    expect(offArrows()).toHaveLength(1);
    expect(offArrows()[0].textContent).toBe('‹');
    expect(offArrows()[0].getAttribute('aria-hidden')).toBe('true');
  });

  it('sans jour d\'après, la flèche de droite est éteinte, et sans aucun voisin les deux le sont', () => {
    const noNext = render({ previousDate: '2026-11-18', nextDate: null });
    expect(noNext.byTestId('archive-next')).toBeNull();
    expect(noNext.offArrows().map(arrow => arrow.textContent)).toEqual(['›']);

    const alone = render({ previousDate: null, nextDate: null });
    expect(alone.offArrows().map(arrow => arrow.textContent)).toEqual(['‹', '›']);
  });
});

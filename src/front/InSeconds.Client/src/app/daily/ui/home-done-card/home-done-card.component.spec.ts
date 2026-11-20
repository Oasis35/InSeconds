import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { TrackResultRow } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { EMPTY_STREAK } from '../../domain/streak';
import { HomeDoneCardComponent } from './home-done-card.component';

const row = (position: number, artistCorrect: boolean | null, titleCorrect: boolean | null): TrackResultRow => ({
  position, artist: 'A', title: 'T', coverUrl: null, artistCorrect, titleCorrect, listenedSeconds: 1,
  averageSecondsWhenCorrect: null, score: 0, deezerTrackId: 1, distribution: [], notFoundCount: 0,
});

describe('HomeDoneCardComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(HomeDoneCardComponent);
    fixture.componentRef.setInput('score', 2410);
    fixture.componentRef.setInput('rows', [row(1, true, true), row(2, true, false), row(3, false, false)]);
    fixture.componentRef.setInput('countdown', '06:12:40');
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, q: (id: string) => element.querySelector(`[data-testid="${id}"]`) };
  }

  it('montre le score, le compte à rebours et une barre par morceau', () => {
    const { element, q } = render();
    expect(q('home-score')?.textContent).toMatch(/2\s410/);
    expect(q('countdown')?.textContent).toContain('06:12:40');
    expect(element.querySelectorAll('[data-testid="track-bar"]')).toHaveLength(3);
  });

  it('carte courte : « Ton score », la série et « Voir le résultat » sous le partage, ni égaliseur ni détail', () => {
    const { element, q } = render({ streak: { ...EMPTY_STREAK, streak: 12, freezes: 2, maxFreezes: 2 }, linked: true });
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('daily.result.yourScore');
    expect(element.querySelector('app-streak-pill')).not.toBeNull();
    expect(q('home-see-result')?.getAttribute('href')).toBe('/daily/resultat');
    expect(element.querySelector('app-score-distribution-chart')).toBeNull();
    expect(element.querySelector('app-track-results-list')).toBeNull();
  });

  it('tuile du moment (tube ambre, partage plein), simple carte quand la Survie passe devant', () => {
    const focus = render();
    expect(focus.q('home-done')?.classList).toContain('tube-amber');
    expect(focus.element.querySelector('app-share-button button')?.className).toContain('primary');
    const behind = render({ focus: false });
    expect(behind.q('home-done')?.classList).not.toContain('tube-amber');
    expect(behind.element.querySelector('app-share-button button')?.className).toContain('accent');
  });

  it('sans moment fort, la phrase dit « mieux que X % »', () => {
    const { q } = render({ betterThanPercent: 58 });
    expect(q('score-better-than')?.textContent).toContain('58 %');
  });

  it('le partage part du bouton de la carte', () => {
    const { fixture, element } = render();
    const spy = vi.fn();
    fixture.componentInstance.share.subscribe(spy);
    (element.querySelector('app-share-button button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('sans score (statistiques en échec) : pas de partage', () => {
    const { element, q } = render({ score: null });
    expect(q('home-score')?.textContent).toContain('-');
    expect(element.querySelector('app-share-button')).toBeNull();
  });
});

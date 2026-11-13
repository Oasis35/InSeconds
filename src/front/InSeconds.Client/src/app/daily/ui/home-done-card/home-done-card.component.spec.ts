import { TestBed } from '@angular/core/testing';
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
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
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

  it('le titre est « Défi du jour », sans « fait » ni date, et le relevé de série est dans la carte', () => {
    const { element } = render({ streak: { ...EMPTY_STREAK, streak: 12, freezes: 2, maxFreezes: 2 }, linked: true });
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('daily.home.done');
    expect(element.querySelector('app-streak-pill')).not.toBeNull();
  });

  it('« Voir le résultat » demande l’écran complet', () => {
    const { fixture, q } = render();
    const spy = vi.fn();
    fixture.componentInstance.seeResult.subscribe(spy);
    (q('home-see-result') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
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

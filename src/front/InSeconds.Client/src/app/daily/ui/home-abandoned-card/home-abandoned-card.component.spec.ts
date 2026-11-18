import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TrackResultRow } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { HomeAbandonedCardComponent } from './home-abandoned-card.component';

const row = (position: number, artistCorrect: boolean | null): TrackResultRow => ({
  position, artist: `A${position}`, title: `T${position}`, coverUrl: null, artistCorrect, titleCorrect: artistCorrect,
  listenedSeconds: artistCorrect === null ? null : 1, averageSecondsWhenCorrect: null, score: artistCorrect ? 850 : artistCorrect === null ? null : 0,
  deezerTrackId: position, distribution: [], notFoundCount: 0,
});

function setup(inputs: Record<string, unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(HomeAbandonedCardComponent);
  fixture.componentRef.setInput('countdown', '05:12:03');
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('HomeAbandonedCardComponent', () => {
  it('sans réponse : le titre, « pas joué » et le compte à rebours, ni score ni détail', () => {
    const { el } = setup({ score: null });
    expect(el.textContent).toContain('daily.home.abandonedNoPlayTitle');
    expect(el.querySelector('[data-testid="home-abandoned-noplay"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="home-abandoned-score"]')).toBeNull();
    expect(el.querySelector('[data-testid="home-abandoned-toggle"]')).toBeNull();
    expect(el.querySelector('[data-testid="home-abandoned-countdown"]')?.textContent).toBe('05:12:03');
  });

  it("tant que les stats n'arrivent pas : jamais « pas joué »", () => {
    const { el } = setup({ score: null, pending: true });
    expect(el.querySelector('[data-testid="home-abandoned-noplay"]')).toBeNull();
  });

  it('après une réponse : le score, une barre par morceau, le détail se déplie', () => {
    const { fixture, el } = setup({ score: 850, rows: [row(1, true), row(2, null), row(3, null)] });
    expect(el.querySelector('[data-testid="home-abandoned-score"]')?.textContent).toContain('850');
    expect(el.querySelector('[data-testid="home-abandoned-noplay"]')).toBeNull();
    expect(el.querySelectorAll('[data-testid="track-bar"]')).toHaveLength(3);
    expect(el.querySelector('[data-testid="home-abandoned-tracks"]')).toBeNull();

    (el.querySelector('[data-testid="home-abandoned-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="home-abandoned-tracks"]')).not.toBeNull();
  });
});

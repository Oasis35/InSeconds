import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TrackResultRow } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { DayHighlightComponent } from './day-highlight.component';

const row = (position: number, found: boolean, distribution: { count: number }[] = []): TrackResultRow => ({
  position, artist: 'Daft Punk', title: 'T', coverUrl: null, artistCorrect: found, titleCorrect: found, listenedSeconds: 1,
  averageSecondsWhenCorrect: null, score: 0, deezerTrackId: 1, distribution: distribution as never, notFoundCount: 0,
});

describe('DayHighlightComponent', () => {
  function render(rows: TrackResultRow[], betterThanPercent: number | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DayHighlightComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('betterThanPercent', betterThanPercent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return (id: string) => element.querySelector(`[data-testid="${id}"]`);
  }

  it('rien sans moment fort ni « mieux que X % »', () => {
    const q = render([row(1, false)], null);
    expect(q('day-highlight')).toBeNull();
    expect(q('score-better-than')).toBeNull();
  });

  it('sans moment fort, dit « mieux que X % »', () => {
    const q = render([row(1, false)], 72);
    expect(q('score-better-than')?.textContent).toContain('72 %');
  });

  it('seul à avoir joué : aucune phrase, la liste dit déjà le temps de chaque morceau', () => {
    const q = render([row(1, true)], null);
    expect(q('day-highlight')).toBeNull();
    expect(q('score-better-than')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TrackResultRow } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { DayHistory } from '../../domain/daily';
import { DayHighlightComponent } from './day-highlight.component';

const row = (position: number, found: boolean, distribution: { count: number }[] = []): TrackResultRow => ({
  position, artist: 'Daft Punk', title: 'T', coverUrl: null, artistCorrect: found, titleCorrect: found, listenedSeconds: 1,
  averageSecondsWhenCorrect: null, score: 0, deezerTrackId: 1, distribution: distribution as never, notFoundCount: 0,
});

describe('DayHighlightComponent', () => {
  function render(rows: TrackResultRow[], betterThanPercent: number | null, history: DayHistory | null = null, yourScore: number | null = null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DayHighlightComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('betterThanPercent', betterThanPercent);
    fixture.componentRef.setInput('history', history);
    fixture.componentRef.setInput('yourScore', yourScore);
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

  it('seul à avoir joué : la phrase vient de l\'historique du joueur', () => {
    const history: DayHistory = { fastestSeconds: 1, fastestFoundPercent: 9, previousGames: 5, previousBestScore: 3000, previousAverageScore: 2000 };
    const q = render([row(1, true)], null, history, 3200);
    expect(q('day-highlight')).toBeNull();
    expect(q('day-history')?.textContent).toContain('daily.result.historyRecord');
  });

  it('seul à avoir joué et sans historique parlant : aucune phrase', () => {
    const q = render([row(1, true)], null, null, 3200);
    expect(q('day-highlight')).toBeNull();
    expect(q('score-better-than')).toBeNull();
    expect(q('day-history')).toBeNull();
  });

  it('« mieux que X % » passe avant l\'historique', () => {
    const history: DayHistory = { fastestSeconds: 1, fastestFoundPercent: 9, previousGames: 5, previousBestScore: 3000, previousAverageScore: 2000 };
    const q = render([row(1, true)], 72, history, 3200);
    expect(q('score-better-than')).not.toBeNull();
    expect(q('day-history')).toBeNull();
  });
});

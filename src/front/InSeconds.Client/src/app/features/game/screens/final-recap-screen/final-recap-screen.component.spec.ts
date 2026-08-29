import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { FinalRecapScreenComponent, RoundResult } from './final-recap-screen.component';
import { TodayStatsResponse } from '../../../../api/api.generated';

// `createComponent` évalue les bindings top-level du template (dont un `| translate`
// hors `@if`) → il faut un TranslateService. On exerce ensuite le computed `recapRows`.
describe('FinalRecapScreenComponent', () => {
  let fixture: ComponentFixture<FinalRecapScreenComponent>;
  let component: FinalRecapScreenComponent;

  const round = (over: Partial<RoundResult> = {}): RoundResult => ({
    artistCorrect: true, titleCorrect: true, score: 1000,
    correctArtist: 'Eminem', correctTitle: 'Lose Yourself',
    listenedDurationSeconds: 0.5, averageSecondsWhenCorrect: 0.5, failureRatePercent: 0,
    position: 1, coverUrl: null, deezerTrackId: 42, ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FinalRecapScreenComponent],
      providers: [provideTranslateService()],
    });
    fixture = TestBed.createComponent(FinalRecapScreenComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('results', [round()]);
    fixture.componentRef.setInput('displayedScore', 1000);
  });

  it('recapRows() derives from results() even without stats (histogramme vide)', () => {
    const rows = component['recapRows']();
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(jasmine.objectContaining({
      position: 1, artist: 'Eminem', title: 'Lose Yourself', score: 1000, notFoundCount: 0,
    }));
    expect(rows[0].guessTimeDistribution).toEqual([]);
  });

  it('recapRows() merges the histogramme from stats by position', () => {
    const stats = {
      yourScore: 1000, medianScore: 1000, totalPlayers: 1, currentStreak: 1,
      tracks: [{
        position: 1, artist: 'Eminem', title: 'Lose Yourself', deezerTrackId: 42, coverUrl: undefined,
        failureRatePercent: 0, averageSecondsWhenCorrect: 0.5,
        artistCorrect: true, titleCorrect: true, listenedDurationSeconds: 0.5, score: 1000,
        guessTimeDistribution: [{ durationSeconds: 0.5, count: 2 }], notFoundCount: 1,
      }],
    } as unknown as TodayStatsResponse;
    fixture.componentRef.setInput('stats', stats);

    const row = component['recapRows']()[0];
    expect(row.guessTimeDistribution).toEqual([{ durationSeconds: 0.5, count: 2 }]);
    expect(row.notFoundCount).toBe(1);
  });
});

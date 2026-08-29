import { TestBed, ComponentFixture } from '@angular/core/testing';
import { AlreadyPlayedScreenComponent } from './already-played-screen.component';
import { TodayStatsResponse } from '../../../../api/api.generated';

// Pas de fixture.detectChanges() (TranslatePipe) : on exerce le computed `playedRows`.
describe('AlreadyPlayedScreenComponent', () => {
  let fixture: ComponentFixture<AlreadyPlayedScreenComponent>;
  let component: AlreadyPlayedScreenComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AlreadyPlayedScreenComponent] });
    fixture = TestBed.createComponent(AlreadyPlayedScreenComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('countdown', '01:02:03');
  });

  it('playedRows() is empty when there are no stats', () => {
    expect(component['playedRows']()).toEqual([]);
  });

  it('playedRows() maps each TrackStat to a TrackResultRow (score + histogramme inclus)', () => {
    const stats = {
      yourScore: 700, medianScore: 700, totalPlayers: 1, currentStreak: 1,
      tracks: [{
        position: 1, artist: 'Eminem', title: 'Lose Yourself', deezerTrackId: 42,
        coverUrl: 'http://x/c.jpg', failureRatePercent: 0, averageSecondsWhenCorrect: 0.5,
        artistCorrect: true, titleCorrect: true, listenedDurationSeconds: 0.5, score: 1000,
        guessTimeDistribution: [{ durationSeconds: 0.5, count: 1 }], notFoundCount: 0,
      }],
    } as unknown as TodayStatsResponse;
    fixture.componentRef.setInput('stats', stats);

    const rows = component['playedRows']();
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(jasmine.objectContaining({
      position: 1, artist: 'Eminem', title: 'Lose Yourself', score: 1000,
      artistCorrect: true, titleCorrect: true, listenedDurationSeconds: 0.5, notFoundCount: 0,
    }));
    expect(rows[0].guessTimeDistribution).toEqual([{ durationSeconds: 0.5, count: 1 }]);
  });

  it('playedRows() keeps null player fields when the player has no completed answer', () => {
    const stats = {
      yourScore: undefined, medianScore: 0, totalPlayers: 0, currentStreak: 0,
      tracks: [{
        position: 1, artist: 'A', title: 'B', deezerTrackId: 1, coverUrl: undefined,
        failureRatePercent: 0, averageSecondsWhenCorrect: undefined,
        artistCorrect: undefined, titleCorrect: undefined, listenedDurationSeconds: undefined,
        score: undefined, guessTimeDistribution: [], notFoundCount: 0,
      }],
    } as unknown as TodayStatsResponse;
    fixture.componentRef.setInput('stats', stats);

    const row = component['playedRows']()[0];
    expect(row.artistCorrect).toBeNull();
    expect(row.score).toBeNull();
    expect(row.coverUrl).toBeNull();
  });
});

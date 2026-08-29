import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TrackResultsListComponent, TrackResultRow } from './track-results-list.component';

// Pas de fixture.detectChanges() (le template utilise TranslatePipe) : on exerce
// directement les méthodes/signals protégés en bracket-notation.
describe('TrackResultsListComponent', () => {
  let fixture: ComponentFixture<TrackResultsListComponent>;
  let component: TrackResultsListComponent;

  const baseRow = (over: Partial<TrackResultRow> = {}): TrackResultRow => ({
    position: 1,
    artist: 'Eminem',
    title: 'Lose Yourself',
    coverUrl: null,
    artistCorrect: true,
    titleCorrect: true,
    listenedDurationSeconds: 1,
    averageSecondsWhenCorrect: 1.2,
    failureRatePercent: 10,
    score: 850,
    deezerTrackId: 42,
    guessTimeDistribution: [{ durationSeconds: 1, count: 3 }],
    notFoundCount: 1,
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TrackResultsListComponent] });
    fixture = TestBed.createComponent(TrackResultsListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('rows', [baseRow()]);
  });

  it('hasChart() is true only when the row has a non-empty distribution', () => {
    expect(component['hasChart'](baseRow())).toBeTrue();
    expect(component['hasChart'](baseRow({ guessTimeDistribution: [] }))).toBeFalse();
  });

  it('openChartFor() opens the popup only when the row has a chart', () => {
    const withChart = baseRow();
    component['openChartFor'](withChart);
    expect(component['openChart']()).toBe(withChart);

    component['closeChart']();
    component['openChartFor'](baseRow({ guessTimeDistribution: [] }));
    expect(component['openChart']()).toBeNull();
  });

  it('closeChart() and onEscape() clear the open popup', () => {
    component['openChartFor'](baseRow());
    expect(component['openChart']()).not.toBeNull();

    component['onEscape']();
    expect(component['openChart']()).toBeNull();

    component['openChartFor'](baseRow());
    component['closeChart']();
    expect(component['openChart']()).toBeNull();
  });
});

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { GuessTimeChartComponent } from './guess-time-chart.component';
import { DurationBucketDto } from '../../core/models/game.models';

// Pas de fixture.detectChanges() (comme browser-id / blind-round) : le template utilise
// TranslatePipe. On exerce le computed `buckets` directement en bracket-notation.
describe('GuessTimeChartComponent', () => {
  let fixture: ComponentFixture<GuessTimeChartComponent>;
  let component: GuessTimeChartComponent;

  const distribution: DurationBucketDto[] = [
    { durationSeconds: 0.5, count: 0 },
    { durationSeconds: 1, count: 3 },
    { durationSeconds: 2, count: 1 },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [GuessTimeChartComponent] });
    fixture = TestBed.createComponent(GuessTimeChartComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('distribution', distribution);
    fixture.componentRef.setInput('notFoundCount', 2);
  });

  it('appends a "not found" bucket after the duration buckets', () => {
    const buckets = component['buckets']();
    expect(buckets).toHaveSize(distribution.length + 1);
    expect(buckets.at(-1)!.key).toBe('nf');
    expect(buckets.at(-1)!.label).toBe('✗');
    expect(buckets.at(-1)!.count).toBe(2);
  });

  it('maps each duration bucket to a d<seconds> key and <seconds>s label', () => {
    const buckets = component['buckets']();
    expect(buckets[0].key).toBe('d0.5');
    expect(buckets[1].key).toBe('d1');
    expect(buckets[1].label).toBe('1s');
  });

  it('highlights the bucket matching highlightDuration (orange bar + label)', () => {
    fixture.componentRef.setInput('highlightDuration', 1);
    const buckets = component['buckets']();
    const highlighted = buckets.filter(b => b.highlighted);
    expect(highlighted).toHaveSize(1);
    expect(highlighted[0].key).toBe('d1');
    expect(highlighted[0].barColor).toBe('var(--color-accent-3)');
    expect(highlighted[0].labelColor).toBe('var(--color-accent-3)');
  });

  it('highlights only the "not found" bucket when highlightNotFound is set', () => {
    fixture.componentRef.setInput('highlightNotFound', true);
    const buckets = component['buckets']();
    expect(buckets.filter(b => b.highlighted).map(b => b.key)).toEqual(['nf']);
    expect(buckets.at(-1)!.barColor).toBe('var(--color-accent-3)');
  });

  it('uses violet for duration bars and red for the "not found" bar by default', () => {
    const buckets = component['buckets']();
    expect(buckets[1].barColor).toBe('var(--color-violet)');
    expect(buckets.at(-1)!.barColor).toBe('var(--color-fail)');
  });

  it('gives a 2px height to empty buckets and scales the rest against the max', () => {
    const buckets = component['buckets']();
    const barMax = 32;
    expect(buckets[0].heightPx).toBe('2px');           // count 0
    expect(buckets[1].heightPx).toBe(`${barMax}px`);   // count 3 == max → full height
    expect(buckets[2].heightPx).toBe(`${Math.max(4, Math.round((1 / 3) * barMax))}px`); // count 1
  });
});

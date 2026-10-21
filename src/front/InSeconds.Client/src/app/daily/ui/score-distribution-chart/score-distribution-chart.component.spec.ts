import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { ScoreDistributionChartComponent, MIN_PLAYERS_FOR_PERCENT } from './score-distribution-chart.component';
import { DayStats } from '../../domain/daily';

// Pas de fixture.detectChanges() (comme guess-time-chart) : le template utilise TranslatePipe.
// On exerce les computed `chart` et `betterThanPercent` directement en bracket-notation.
describe('ScoreDistributionChartComponent', () => {
  let fixture: ComponentFixture<ScoreDistributionChartComponent>;
  let component: ScoreDistributionChartComponent;

  /** 10 tranches de 500 pts sur 0–5000, comptes donnés. */
  const buckets = (counts: number[]) => counts.map((count, i) => ({ minScore: i * 500, maxScore: i === 9 ? 5000 : i * 500 + 499, count }));

  const stats = (overrides: Partial<DayStats> = {}): DayStats => ({
    yourScore: 3150, medianScore: 2450, totalPlayers: 47, currentStreak: 1, tracks: [],
    freezesUsed: 0, freezeMilestone: false,
    minScore: 350, maxScore: 4650, maxPossibleScore: 5000,
    scoreDistribution: buckets([2, 1, 4, 5, 12, 9, 7, 3, 2, 2]),
    betterThanPercent: 74,
    ...overrides,
  });

  const litCells = (column: number) => component['chart']()!.cells.filter(c => c.key.startsWith(`${column}-`) && c.lit);

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ScoreDistributionChartComponent], providers: [provideTranslateService()] });
    fixture = TestBed.createComponent(ScoreDistributionChartComponent);
    component = fixture.componentInstance;
  });

  it('returns no chart when the distribution is empty', () => {
    fixture.componentRef.setInput('stats', stats({ scoreDistribution: [], maxPossibleScore: 0 }));
    expect(component['chart']()).toBeNull();
  });

  it('draws 6 cells per bucket and fills the tallest column entirely', () => {
    fixture.componentRef.setInput('stats', stats());
    const chart = component['chart']()!;
    expect(chart.cells).toHaveLength(10 * 6);
    expect(litCells(4)).toHaveLength(6); // 12 = max
    expect(litCells(1)).toHaveLength(1); // 1/12 → au moins une case
    expect(litCells(0).length).toBeLessThan(6);
  });

  it('keeps an empty bucket entirely unlit', () => {
    fixture.componentRef.setInput('stats', stats({ scoreDistribution: buckets([0, 3, 0, 0, 0, 0, 0, 0, 0, 0]) }));
    expect(litCells(0)).toHaveLength(0);
  });

  it("highlights the player's bucket in orange and the others in violet", () => {
    fixture.componentRef.setInput('stats', stats());
    expect(litCells(6).every(c => c.fill === 'var(--color-accent-3)')).toBe(true); // 3150 → 3000–3499
    expect(litCells(4).every(c => c.fill === 'var(--color-violet)')).toBe(true);
  });

  it('highlights nothing when the player has no score', () => {
    fixture.componentRef.setInput('stats', stats({ yourScore: null }));
    expect(component['chart']()!.cells.some(c => c.fill === 'var(--color-accent-3)')).toBe(false);
  });

  it('puts a score above the last bound in the last column', () => {
    fixture.componentRef.setInput('stats', stats({ yourScore: 6000 }));
    expect(litCells(9).every(c => c.fill === 'var(--color-accent-3)')).toBe(true);
  });

  it('places the median tick at its real position and the lowest/highest labels on the edges', () => {
    fixture.componentRef.setInput('stats', stats());
    const chart = component['chart']()!;
    expect(chart.median!.tickX).toBeCloseTo(10 + (2450 / 5000) * 280, 5);
    expect(chart.median!.value).toBe(2450);
    expect(chart.lowest!.tickX).toBeCloseTo(10 + (350 / 5000) * 280, 5);
    expect(chart.lowest!.labelX).toBe(10);
    expect(chart.highest!.labelX).toBe(290);
    expect(chart.highest!.value).toBe(4650);
  });

  it('keeps the median label away from the edges when the median is extreme', () => {
    fixture.componentRef.setInput('stats', stats({ medianScore: 100 }));
    const median = component['chart']()!.median!;
    expect(median.tickX).toBeCloseTo(10 + (100 / 5000) * 280, 5);
    expect(median.labelX).toBe(75);
  });

  // Tous les scores à 0 : médiane = plus bas, et l'étiquette « médiane » se posait sur « plus bas ».
  it.each([
    ['fr', { medianScore: 0, minScore: 0, maxScore: 0 }],
    ['fr', { medianScore: 5000, minScore: 5000, maxScore: 5000 }],
    ['en', { medianScore: 0, minScore: 0, maxScore: 0 }],
  ] as const)('never draws the median label over the lowest/highest labels (%s, %o)', async (lang, over) => {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(lang, { daily: { scoreChart: lang === 'fr'
      ? { median: 'médiane', lowest: 'plus bas', highest: 'plus haut' }
      : { median: 'median', lowest: 'lowest', highest: 'highest' } } });
    translate.use(lang);
    fixture.componentRef.setInput('stats', stats(over));
    fixture.detectChanges();
    await fixture.whenStable();

    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll<SVGTextElement>('svg text')]
      .filter(t => /médiane|median|plus bas|lowest|plus haut|highest/.test(t.textContent ?? ''))
      .map(t => ({ text: t.textContent!.trim(), box: t.getBBox() }));
    const median = labels.find(l => /médiane|median/.test(l.text))!.box;
    for (const edge of labels.filter(l => !/médiane|median/.test(l.text)).map(l => l.box)) {
      const overlaps = median.x < edge.x + edge.width && edge.x < median.x + median.width;
      expect(overlaps).toBe(false);
    }
  });

  it('hides the markers when nobody has completed the challenge', () => {
    fixture.componentRef.setInput('stats', stats({
      totalPlayers: 0, minScore: null, maxScore: null, medianScore: 0,
      scoreDistribution: buckets(new Array(10).fill(0)),
    }));
    const chart = component['chart']()!;
    expect(chart.median).toBeNull();
    expect(chart.lowest).toBeNull();
    expect(chart.highest).toBeNull();
  });

  it(`shows the percentage from ${MIN_PLAYERS_FOR_PERCENT} players, including 0 %`, () => {
    fixture.componentRef.setInput('stats', stats({ totalPlayers: MIN_PLAYERS_FOR_PERCENT, betterThanPercent: 0 }));
    expect(component['betterThanPercent']()).toBe(0);
  });

  it(`hides the percentage under ${MIN_PLAYERS_FOR_PERCENT} players but keeps the chart`, () => {
    fixture.componentRef.setInput('stats', stats({ totalPlayers: MIN_PLAYERS_FOR_PERCENT - 1, betterThanPercent: 67 }));
    expect(component['betterThanPercent']()).toBeNull();
    expect(component['chart']()).not.toBeNull();
  });

  it('hides the percentage when the API has none (player alone or without score)', () => {
    fixture.componentRef.setInput('stats', stats({ betterThanPercent: null }));
    expect(component['betterThanPercent']()).toBeNull();
  });
});

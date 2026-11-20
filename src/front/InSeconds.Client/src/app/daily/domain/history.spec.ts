import { calendarWeeks, dayLink, scoreTint } from './history';

describe('historique du défi du jour', () => {
  it('le calendrier commence un lundi et éteint les jours sans défi', () => {
    // Novembre 2026 commence un dimanche : six cases vides avant le 1er.
    const weeks = calendarWeeks('2026-11', [
      { date: '2026-11-02', state: 'played', score: 3000, maxPossibleScore: 5000 },
      { date: '2026-11-03', state: 'missed', score: null, maxPossibleScore: 5000 },
      { date: '2026-11-04', state: 'unfinished', score: null, maxPossibleScore: 5000 },
      { date: '2026-11-05', state: 'today', score: null, maxPossibleScore: 5000 },
    ]);

    expect(weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(weeks[0][6]).toEqual({ date: '2026-11-01', day: 1, state: 'none', score: null, tint: 0 });
    expect(weeks[1].slice(0, 4).map(c => c?.state)).toEqual(['played', 'missed', 'unfinished', 'today']);
    expect(weeks[1][0]?.tint).toBeGreaterThan(0.18);
    expect(weeks.every(w => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(c => c !== null)).toHaveLength(30);
  });

  it("la teinte suit le score, bornée entre 0,18 et 0,92", () => {
    expect(scoreTint(0, 5000)).toBe(0.18);
    expect(scoreTint(5000, 5000)).toBe(0.92);
    expect(scoreTint(2500, 5000)).toBeCloseTo(0.55, 2);
    expect(scoreTint(100, 0)).toBe(0.18);
  });

  it("une case mène aux réponses du jour, aujourd'hui au défi, un jour sans défi nulle part", () => {
    expect(dayLink({ date: '2026-11-10', day: 10, state: 'missed', score: null, tint: 0 })).toEqual(['/history/daily', '2026-11-10']);
    expect(dayLink({ date: '2026-11-11', day: 11, state: 'today', score: null, tint: 0 })).toEqual(['/daily']);
    expect(dayLink({ date: '2026-11-12', day: 12, state: 'none', score: null, tint: 0 })).toBeNull();
  });
});

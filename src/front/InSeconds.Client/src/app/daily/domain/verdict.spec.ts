import { maxDayScore, scoreVerdict } from './verdict';

describe('verdict', () => {
  it('le maximum d\'un défi : les morceaux au meilleur barème', () => {
    expect(maxDayScore(5, [{ score: 850 }, { score: 1000 }, { score: 550 }])).toBe(5000);
  });

  it('pas de maximum sans morceaux ni barème', () => {
    expect(maxDayScore(0, [{ score: 1000 }])).toBeNull();
    expect(maxDayScore(5, [])).toBeNull();
    expect(maxDayScore(undefined, null)).toBeNull();
  });

  it('cinq tranches d\'un cinquième du maximum', () => {
    const at = (score: number) => scoreVerdict(score, 5000);
    expect([0, 999, 1000, 1999, 2000, 2999, 3000, 3999, 4000, 5000].map(at)).toEqual([
      'warmup', 'warmup', 'correct', 'correct', 'veryGood', 'veryGood', 'excellent', 'excellent', 'almostPerfect', 'almostPerfect',
    ]);
  });

  it('suit le maximum du défi (trois morceaux)', () => {
    expect(scoreVerdict(1900, 3000)).toBe('excellent');
  });

  it('rien sans score ni maximum', () => {
    expect(scoreVerdict(null, 5000)).toBeNull();
    expect(scoreVerdict(1200, null)).toBeNull();
  });
});

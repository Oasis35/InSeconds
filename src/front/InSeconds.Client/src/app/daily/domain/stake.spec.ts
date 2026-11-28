import { dailyStake } from './stake';

const SETTINGS = {
  durationScores: [{ seconds: 0.5, score: 1000 }, { seconds: 1, score: 850 }, { seconds: 5, score: 250 }, { seconds: 10, score: 25 }],
  retryScorePercent: 70,
};

describe('dailyStake', () => {
  it('vaut le barème du palier', () => {
    expect(dailyStake(SETTINGS, 0.5)).toBe(1000);
    expect(dailyStake(SETTINGS, 1)).toBe(850);
  });

  it('vaut 0 pour un palier sans barème', () => {
    expect(dailyStake(SETTINGS, 3)).toBe(0);
  });

  it('applique le facteur de la seconde tentative', () => {
    expect(dailyStake(SETTINGS, 0.5, true)).toBe(700);
    // 850 × 0,7 = 595
    expect(dailyStake(SETTINGS, 1, true)).toBe(595);
  });

  it('arrondit la seconde tentative au pair, comme le serveur', () => {
    // 25 × 0,7 = 17,5 → 18 ; 250 × 0,7 = 175
    expect(dailyStake(SETTINGS, 10, true)).toBe(18);
    expect(dailyStake(SETTINGS, 5, true)).toBe(175);
    // 5 × 0,5 = 2,5 → 2 (pair)
    expect(dailyStake({ ...SETTINGS, durationScores: [{ seconds: 1, score: 5 }], retryScorePercent: 50 }, 1, true)).toBe(2);
  });
});

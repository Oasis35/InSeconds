import { dailyStake } from './stake';

const SETTINGS = {
  durationScores: [{ seconds: 0.5, score: 1000 }, { seconds: 1, score: 850 }, { seconds: 5, score: 250 }, { seconds: 10, score: 25 }],
  hints: [
    { level: 1, unlockSeconds: 5, kind: 'year', penaltyPercent: 30 },
    { level: 2, unlockSeconds: 10, kind: 'artistMasked', penaltyPercent: 50 },
  ],
  retryScorePercent: 70,
};

describe('dailyStake', () => {
  it('vaut le barème du palier sans indice', () => {
    expect(dailyStake(SETTINGS, 0.5, 0)).toBe(1000);
    expect(dailyStake(SETTINGS, 1, 0)).toBe(850);
  });

  it('retire la pénalité du niveau d\'indice pris', () => {
    expect(dailyStake(SETTINGS, 5, 1)).toBe(175);
    expect(dailyStake(SETTINGS, 1, 1)).toBe(595);
  });

  it('reprend le barème par défaut : 100 au dernier palier avec l\'indice 2 à 60 % donne 40', () => {
    const settings = { durationScores: [{ seconds: 10, score: 100 }], hints: [{ ...SETTINGS.hints[1], penaltyPercent: 60 }], retryScorePercent: 70 };
    expect(dailyStake(settings, 10, 2)).toBe(40);
  });

  it('arrondit une moitié au pair, comme le serveur', () => {
    // 25 × 0,5 = 12,5 → 12
    expect(dailyStake(SETTINGS, 10, 2)).toBe(12);
  });

  it('vaut 0 pour un palier sans barème', () => {
    expect(dailyStake(SETTINGS, 3, 0)).toBe(0);
  });

  it('applique le facteur de la seconde tentative avant la pénalité de l\'indice', () => {
    expect(dailyStake(SETTINGS, 0.5, 0, true)).toBe(700);
    // 850 × 0,7 = 595 ; puis l'indice 1 à 30 % : 416,5 → 416
    expect(dailyStake(SETTINGS, 1, 1, true)).toBe(416);
  });

  it('arrondit la seconde tentative au pair, comme le serveur', () => {
    // 25 × 0,7 = 17,5 → 18 ; 250 × 0,7 = 175
    expect(dailyStake(SETTINGS, 10, 0, true)).toBe(18);
    expect(dailyStake(SETTINGS, 5, 0, true)).toBe(175);
    // 5 × 0,5 = 2,5 → 2 (pair)
    expect(dailyStake({ ...SETTINGS, durationScores: [{ seconds: 1, score: 5 }], retryScorePercent: 50 }, 1, 0, true)).toBe(2);
  });
});

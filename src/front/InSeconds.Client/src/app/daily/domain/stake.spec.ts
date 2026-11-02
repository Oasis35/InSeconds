import { dailyStake } from './stake';

const SETTINGS = {
  durationScores: [{ seconds: 0.5, score: 1000 }, { seconds: 1, score: 850 }, { seconds: 5, score: 250 }, { seconds: 10, score: 25 }],
  hints: [
    { level: 1, unlockSeconds: 5, kind: 'year', penaltyPercent: 30 },
    { level: 2, unlockSeconds: 10, kind: 'artistMasked', penaltyPercent: 50 },
  ],
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
    const settings = { durationScores: [{ seconds: 10, score: 100 }], hints: [{ ...SETTINGS.hints[1], penaltyPercent: 60 }] };
    expect(dailyStake(settings, 10, 2)).toBe(40);
  });

  it('arrondit une moitié au pair, comme le serveur', () => {
    // 25 × 0,5 = 12,5 → 12
    expect(dailyStake(SETTINGS, 10, 2)).toBe(12);
  });

  it('vaut 0 pour un palier sans barème', () => {
    expect(dailyStake(SETTINGS, 3, 0)).toBe(0);
  });
});

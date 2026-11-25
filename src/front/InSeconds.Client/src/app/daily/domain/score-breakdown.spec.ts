import { DailySettings } from './daily';
import { scoreBreakdown } from './score-breakdown';

const settings = {
  durationScores: [{ seconds: 0.5, score: 1000 }, { seconds: 1, score: 850 }, { seconds: 2, score: 550 }],
  hints: [{ level: 1, unlockSeconds: 5, kind: 'year', penaltyPercent: 30 }, { level: 2, unlockSeconds: 10, kind: 'artistMasked', penaltyPercent: 60 }],
} satisfies Pick<DailySettings, 'durationScores' | 'hints'>;

const answer = (over: Partial<Parameters<typeof scoreBreakdown>[1]> = {}) =>
  ({ artistCorrect: true, titleCorrect: true, listenedSeconds: 1, hintLevel: 0, score: 850, ...over });

describe('scoreBreakdown', () => {
  it('artiste et titre trouvés sans indice : le barème du palier, rien d\'autre', () => {
    expect(scoreBreakdown(settings, answer())).toEqual({ seconds: 1, base: 850, missed: null, hintPenaltyPercent: 0, score: 850 });
  });

  it('un seul des deux trouvé : dit lequel manque', () => {
    expect(scoreBreakdown(settings, answer({ titleCorrect: false, score: 425 }))?.missed).toBe('title');
    expect(scoreBreakdown(settings, answer({ artistCorrect: false, score: 425 }))?.missed).toBe('artist');
  });

  it('un indice pris : le pourcentage de son niveau', () => {
    expect(scoreBreakdown(settings, answer({ hintLevel: 2, score: 340 }))?.hintPenaltyPercent).toBe(60);
  });

  it('un niveau d\'indice inconnu ne retire rien', () => {
    expect(scoreBreakdown(settings, answer({ hintLevel: 9 }))?.hintPenaltyPercent).toBe(0);
  });

  it('rien trouvé : pas de détail', () => {
    expect(scoreBreakdown(settings, answer({ artistCorrect: false, titleCorrect: false, score: 0 }))).toBeNull();
  });

  it('un palier sans barème : pas de détail', () => {
    expect(scoreBreakdown(settings, answer({ listenedSeconds: 7 }))).toBeNull();
  });
});

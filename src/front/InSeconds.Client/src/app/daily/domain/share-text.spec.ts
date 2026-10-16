import { dayLabel, shareLines } from './share-text';

describe('shareLines', () => {
  it("un ✅ ou ❌ pour l'artiste, un pour le titre, et le palier écouté", () => {
    expect(shareLines([
      { artistCorrect: true, titleCorrect: true, listenedSeconds: 0.5 },
      { artistCorrect: true, titleCorrect: false, listenedSeconds: 3 },
      { artistCorrect: false, titleCorrect: false, listenedSeconds: 10 },
    ])).toEqual(['✅/✅ 0.5s', '✅/❌ 3s', '❌/❌ 10s']);
  });
});

describe('dayLabel', () => {
  it('jour/mois sur deux chiffres', () => {
    expect(dayLabel(new Date(2026, 0, 5))).toBe('05/01');
    expect(dayLabel(new Date(2026, 9, 28))).toBe('28/10');
  });
});

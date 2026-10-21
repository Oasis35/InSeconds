import { dayLabel, shareLine } from './share-text';

describe('shareLine', () => {
  it('un ✅ par morceau trouvé (artiste ou titre), un ❌ par morceau raté, sur une ligne', () => {
    expect(shareLine([
      { artistCorrect: true, titleCorrect: true },
      { artistCorrect: true, titleCorrect: false },
      { artistCorrect: false, titleCorrect: true },
      { artistCorrect: false, titleCorrect: false },
      { artistCorrect: true, titleCorrect: true },
    ])).toBe('✅✅✅❌✅');
  });
});

describe('dayLabel', () => {
  it('jour/mois sur deux chiffres', () => {
    expect(dayLabel(new Date(2026, 0, 5))).toBe('05/01');
    expect(dayLabel(new Date(2026, 9, 28))).toBe('28/10');
  });
});

import { gameLink, verdictOf } from './history';

describe('historique du défi du jour', () => {
  it('une barre dit tout trouvé, à moitié ou raté', () => {
    expect(verdictOf({ position: 1, artistCorrect: true, titleCorrect: true })).toBe('found');
    expect(verdictOf({ position: 1, artistCorrect: true, titleCorrect: false })).toBe('half');
    expect(verdictOf({ position: 1, artistCorrect: false, titleCorrect: true })).toBe('half');
    expect(verdictOf({ position: 1, artistCorrect: false, titleCorrect: false })).toBe('missed');
  });

  it("une ligne mène aux réponses du jour, sauf aujourd'hui (pas encore publiées)", () => {
    expect(gameLink('2026-11-10', '2026-11-11')).toEqual(['/history/daily', '2026-11-10']);
    expect(gameLink('2026-11-11', '2026-11-11')).toEqual(['/daily']);
  });
});

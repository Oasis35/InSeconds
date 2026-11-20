import { appendDays, missOf, replayKey } from './replay';

describe('à réécouter', () => {
  it('dit ce qui a été raté', () => {
    expect(missOf({ artistCorrect: false, titleCorrect: false })).toBe('nothing');
    expect(missOf({ artistCorrect: true, titleCorrect: false })).toBe('title');
    expect(missOf({ artistCorrect: false, titleCorrect: true })).toBe('artist');
  });

  it('ajoute une page sans répéter un jour', () => {
    const day = (date: string) => ({ date, tracks: [] });
    expect(appendDays([day('2026-11-19'), day('2026-11-18')], [day('2026-11-18'), day('2026-11-17')]).map(d => d.date))
      .toEqual(['2026-11-19', '2026-11-18', '2026-11-17']);
  });

  it("la clé d'un morceau tient la date et la position", () => {
    expect(replayKey('2026-11-19', 3)).toBe('2026-11-19#3');
  });
});

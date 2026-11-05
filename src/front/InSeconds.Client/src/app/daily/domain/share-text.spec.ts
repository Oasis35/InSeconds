import { dayLabel, shareLines } from './share-text';

describe('shareLines', () => {
  const tracks = [
    { artistCorrect: true, titleCorrect: true, listenedSeconds: 0.5 },
    { artistCorrect: true, titleCorrect: false, listenedSeconds: 3 },
    { artistCorrect: false, titleCorrect: true, listenedSeconds: 5 },
    { artistCorrect: false, titleCorrect: false, listenedSeconds: 10 },
  ];
  const format = (seconds: number, lang: string) => `${seconds}s (${lang})`;

  it("une ligne par morceau : l'emoji de l'artiste, celui du titre, puis le palier mis en forme dans la langue", () => {
    expect(shareLines(tracks, format, 'fr')).toEqual(['✅✅ 0.5s (fr)', '✅❌ 3s (fr)', '❌✅ 5s (fr)', '❌❌ 10s (fr)']);
  });

  it('rien pour une partie sans morceau', () => {
    expect(shareLines([], format, 'fr')).toEqual([]);
  });
});

describe('dayLabel', () => {
  it("jour/mois d'un jour de jeu, sur deux chiffres", () => {
    expect(dayLabel('2026-01-05')).toBe('05/01');
    expect(dayLabel('2026-10-28')).toBe('28/10');
  });
});

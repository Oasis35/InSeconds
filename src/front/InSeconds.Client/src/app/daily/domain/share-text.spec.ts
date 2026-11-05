import { dayLabel, shareLines } from './share-text';

describe('shareLines', () => {
  const tracks = [
    { artistCorrect: true, titleCorrect: true, listenedSeconds: 0.5 },
    { artistCorrect: true, titleCorrect: false, listenedSeconds: 3 },
    { artistCorrect: false, titleCorrect: true, listenedSeconds: 5 },
    { artistCorrect: false, titleCorrect: false, listenedSeconds: 10 },
  ];

  it("une ligne par morceau : l'emoji de l'artiste, celui du titre, puis le palier mis en forme", () => {
    expect(shareLines(tracks, s => `${s}s`)).toEqual(['✅✅ 0.5s', '✅❌ 3s', '❌✅ 5s', '❌❌ 10s']);
  });

  it('rien pour une partie sans morceau', () => {
    expect(shareLines([], s => `${s}s`)).toEqual([]);
  });
});

describe('dayLabel', () => {
  it('jour/mois sur deux chiffres', () => {
    expect(dayLabel(new Date(2026, 0, 5))).toBe('05/01');
    expect(dayLabel(new Date(2026, 9, 28))).toBe('28/10');
  });
});

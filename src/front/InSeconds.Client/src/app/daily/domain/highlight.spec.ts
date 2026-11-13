import { HighlightTrack, highlightOf } from './highlight';

const track = (over: Partial<HighlightTrack> = {}): HighlightTrack => ({
  position: 1, artist: 'Daft Punk', found: true, listenedSeconds: 1,
  // 20 joueurs : 2 à 0,5 s, 1 à 1 s, 7 plus tard, 10 ratés.
  distribution: [{ durationSeconds: 0.5, count: 2 }, { durationSeconds: 1, count: 1 }, { durationSeconds: 3, count: 7 }],
  notFoundCount: 10,
  ...over,
});

describe('highlightOf', () => {
  it('cite le morceau trouvé le plus vite par rapport aux autres, en part des joueurs à ce palier ou plus vite', () => {
    expect(highlightOf([track()])).toEqual({ kind: 'fast', artist: 'Daft Punk', seconds: 1, percent: 15 });
  });

  it('garde le morceau à la plus petite part ; à égalité le palier le plus court, puis le premier', () => {
    const slowerButRarer = track({ position: 1, artist: 'A', listenedSeconds: 3, distribution: [{ durationSeconds: 3, count: 1 }], notFoundCount: 19 });
    const tie = track({ position: 2, artist: 'B', listenedSeconds: 0.5, distribution: [{ durationSeconds: 0.5, count: 1 }], notFoundCount: 19 });
    expect(highlightOf([slowerButRarer, tie])).toMatchObject({ artist: 'B', percent: 5 });
    expect(highlightOf([track({ position: 1, artist: 'A' }), track({ position: 2, artist: 'B' })])).toMatchObject({ artist: 'A' });
  });

  it('au-delà de 25 %, cite un morceau trouvé que la moitié des joueurs a raté', () => {
    const common = track({ distribution: [{ durationSeconds: 1, count: 8 }], notFoundCount: 2 });
    const missed = track({ position: 2, artist: 'Indochine', listenedSeconds: 10, distribution: [{ durationSeconds: 10, count: 3 }], notFoundCount: 7 });
    expect(highlightOf([common, missed])).toEqual({ kind: 'rare', artist: 'Indochine', percent: 70 });
  });

  it('pas de phrase quand rien ne flatte', () => {
    expect(highlightOf([track({ distribution: [{ durationSeconds: 1, count: 8 }], notFoundCount: 2 })])).toBeNull();
  });

  it('ignore les morceaux ratés par le joueur et ceux de moins de 5 joueurs', () => {
    expect(highlightOf([track({ found: false })])).toBeNull();
    expect(highlightOf([track({ distribution: [{ durationSeconds: 1, count: 1 }], notFoundCount: 3 })])).toBeNull();
    expect(highlightOf([])).toBeNull();
  });
});

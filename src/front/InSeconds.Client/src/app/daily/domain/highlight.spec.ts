import { DayHistory } from './daily';
import { HighlightTrack, highlightOf, historyHighlightOf } from './highlight';

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

describe('historyHighlightOf', () => {
  const history = (over: Partial<DayHistory> = {}): DayHistory => ({
    fastestSeconds: 1, fastestFoundPercent: 9, previousGames: 5, previousBestScore: 3000, previousAverageScore: 2000, ...over,
  });

  it('un record personnel passe avant tout', () => {
    expect(historyHighlightOf(history(), 3200)).toEqual({ kind: 'record', previousBest: 3000 });
  });

  it('sinon la vitesse, quand peu de morceaux sont trouvés aussi vite', () => {
    expect(historyHighlightOf(history(), 2500)).toEqual({ kind: 'speed', seconds: 1, percent: 9 });
  });

  it('sinon la moyenne, quand le score la dépasse', () => {
    expect(historyHighlightOf(history({ fastestFoundPercent: 60 }), 2500)).toEqual({ kind: 'average', average: 2000 });
  });

  it('rien sans assez de parties passées pour un record ou une moyenne, ni sans comparaison de vitesse', () => {
    expect(historyHighlightOf(history({ previousGames: 2, fastestFoundPercent: null }), 3200)).toBeNull();
    expect(historyHighlightOf(history({ fastestFoundPercent: 60 }), 1500)).toBeNull();
    expect(historyHighlightOf(null, 3200)).toBeNull();
  });
});

import { hintLabelKey } from './hint-label';
import { foundSomething, RoundResult } from './round-result';

describe('hintLabelKey', () => {
  it.each([
    ['year', 'gameplay.hint.kind.year'],
    ['Year', 'gameplay.hint.kind.year'],
    ['artistMasked', 'gameplay.hint.kind.artist'],
    ['ArtistMasked', 'gameplay.hint.kind.artist'],
    ['decade', 'gameplay.hint.kind.other'],
  ])('%s → %s', (kind, key) => expect(hintLabelKey(kind)).toBe(key));
});

describe('foundSomething', () => {
  const result = (artistCorrect: boolean, titleCorrect: boolean): RoundResult => ({
    artistCorrect, titleCorrect, correctArtist: 'A', correctTitle: 'T', coverUrl: null, listenedSeconds: 1, distribution: [], notFoundCount: 0,
  });

  it('est vrai dès que l\'artiste ou le titre est juste', () => {
    expect(foundSomething(result(true, false))).toBe(true);
    expect(foundSomething(result(false, true))).toBe(true);
    expect(foundSomething(result(false, false))).toBe(false);
  });
});

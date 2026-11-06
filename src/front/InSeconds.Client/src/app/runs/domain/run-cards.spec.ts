import { RUN_CARDS, cardGlyph, handFull, handSlots, isRunCard } from './run-cards';
import { RunSession, nextObjective, palierDue } from './run';

describe('les cartes', () => {
  it('reconnaît les huit cartes et rien d\'autre', () => {
    expect(RUN_CARDS).toHaveLength(8);
    expect(RUN_CARDS.every(isRunCard)).toBe(true);
    expect(isRunCard('magic')).toBe(false);
  });

  it('chaque carte a son signe ; les durées et pourcentages s\'écrivent avec leur espace', () => {
    expect(RUN_CARDS.map(cardGlyph).every(g => g.length > 0)).toBe(true);
    expect(cardGlyph('extend')).toBe('20 s');
    expect(cardGlyph('lower_target')).toBe('−20 %');
  });

  it('la main : les cartes dans l\'ordre, puis des emplacements vides jusqu\'à sa taille', () => {
    expect(handSlots([{ slot: 3, card: 'net' }, { slot: 1, card: 'year' }], 2).map(s => s?.card ?? null)).toEqual(['year', 'net']);
    expect(handSlots([{ slot: 1, card: 'year' }], 2).map(s => s?.card ?? null)).toEqual(['year', null]);
    expect(handSlots([], 0)).toEqual([]);
  });

  it('main pleine à sa taille, jamais sans coups de pouce', () => {
    expect(handFull([{ slot: 1, card: 'year' }, { slot: 2, card: 'net' }], 2)).toBe(true);
    expect(handFull([{ slot: 1, card: 'year' }], 2)).toBe(false);
    expect(handFull([], 0)).toBe(false);
  });
});

describe('l\'écran de palier', () => {
  const session = (overrides: Partial<RunSession> = {}): RunSession => ({
    sessionId: 1, challengeCode: 'ABC234', status: 'pending', rounds: 4, tracksPerRound: 5, listenSeconds: 10, totalScore: 500, roundsPassed: 1,
    round: { round: 2, score: 0, objective: 366, maxScore: 665 }, roundTracks: [], finish: null, answerSeconds: 45, clockRemainingSeconds: null,
    playedTracks: [], passedRounds: [{ round: 1, score: 500, objective: 225, disc: { key: 'runs.discs.wax', stars: 0 } }],
    difficultyChoice: { round: 2, options: [{ difficulty: 'safe', objective: 366, maxScore: 665, listenSeconds: 10 }] },
    hand: [], offer: { afterRound: 1, cards: ['year'] }, handSize: 2, nextDisc: { key: 'runs.discs.bronze', stars: 0 },
    ...overrides,
  });

  it('dû après une manche passée, tant que l\'offre ou la difficulté attendent le joueur', () => {
    expect(palierDue(session(), null)).toBe(true);
    expect(palierDue(session({ offer: null }), null)).toBe(true);
    expect(palierDue(session({ offer: null, difficultyChoice: null }), null)).toBe(false);
  });

  it('jamais sans coups de pouce, à la première manche, une fois quitté par « Suite », ni la manche commencée', () => {
    expect(palierDue(session({ handSize: 0 }), null)).toBe(false);
    expect(palierDue(session({ round: { round: 1, score: 0, objective: 225, maxScore: 500 }, passedRounds: [] }), null)).toBe(false);
    expect(palierDue(session(), 2)).toBe(false);
    expect(palierDue(session({ roundTracks: [{ position: 6, round: 2, neutralized: false, artistCorrect: true, titleCorrect: true, points: 133,
      artist: 'A', title: 'T', coverUrl: null, deezerTrackId: 1, waveform: null }] }), null)).toBe(false);
  });

  it('l\'objectif montré : celui de « Sûre », sinon celui de la manche', () => {
    expect(nextObjective(session())).toBe(366);
    expect(nextObjective(session({ difficultyChoice: null, round: { round: 2, score: 0, objective: 400, maxScore: 665 } }))).toBe(400);
  });
});

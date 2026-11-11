import { RUN_CARDS, RunCardValues, cardGlyph, isRunCard, playedCards } from './run-cards';
import { RunSession, nextObjective, palierDue } from './run';

const VALUES: RunCardValues = { extendBonusSeconds: 5, rewardMarginPercent: 25 };

describe('les cartes', () => {
  it('reconnaît les trois cartes qui se gagnent et rien d\'autre (l\'Échange n\'est pas une carte)', () => {
    expect(RUN_CARDS).toEqual(['three_choices', 'hint', 'extend']);
    expect(RUN_CARDS.every(isRunCard)).toBe(true);
    expect(isRunCard('swap')).toBe(false);
    expect(isRunCard('joker')).toBe(false);
  });

  it('chaque carte a son signe ; les secondes de la Prolongation viennent de la playlist', () => {
    expect(RUN_CARDS.every(card => cardGlyph(card, VALUES).length > 0 && cardGlyph(card, null).length > 0)).toBe(true);
    expect(cardGlyph('extend', VALUES)).toBe('+5 s');
    // Sans les valeurs, aucun chiffre inventé.
    expect(/\d/.test(cardGlyph('extend', null))).toBe(false);
  });

  it('l\'Indice se lit sur une ligne : année, initiales, genre ; ce qu\'il ne sait pas est omis', () => {
    const effects = {
      cards: ['hint'] as const, year: 1995, artistInitials: ['D', 'P'], titleInitials: ['G', 'L'], choices: null, genre: 'Électro',
    };
    expect(playedCards(effects)).toEqual([{ card: 'hint', facts: [
      { kind: 'year', value: '1995' }, { kind: 'artist', value: 'D. P.' }, { kind: 'title', value: 'G. L.' }, { kind: 'genre', value: 'Électro' }] }]);
    expect(playedCards({ ...effects, genre: null, artistInitials: null })).toEqual([{ card: 'hint', facts: [{ kind: 'year', value: '1995' }, { kind: 'title', value: 'G. L.' }] }]);
  });

  it('les autres cartes actives n\'ont pas de valeur à lire ; sans effets, rien', () => {
    const effects = { cards: ['three_choices', 'extend'] as const, year: null, artistInitials: null, titleInitials: null, choices: null, genre: null };
    expect(playedCards(effects)).toEqual([{ card: 'three_choices', facts: [] }, { card: 'extend', facts: [] }]);
    expect(playedCards(null)).toEqual([]);
  });
});

describe('l\'écran de palier', () => {
  const session = (overrides: Partial<RunSession> = {}): RunSession => ({
    sessionId: 1, challengeCode: 'ABC234', status: 'pending', rounds: 4, tracksPerRound: 5, listenSeconds: 10, totalScore: 500, roundsPassed: 1,
    round: { round: 2, score: 0, objective: 366, maxScore: 665 }, roundTracks: [], finish: null, answerSeconds: 45, clockRemainingSeconds: null,
    playedTracks: [], passedRounds: [{ round: 1, score: 500, objective: 225, disc: { key: 'runs.discs.wax', stars: 0 } }],
    difficultyChoice: { round: 2, options: [{ difficulty: 'safe', objective: 366, maxScore: 665, listenSeconds: 10 }] },
    hand: [], swapAvailable: false, nextDisc: { key: 'runs.discs.bronze', stars: 0 }, cardValues: null, ghost: null, themes: [],
    ...overrides,
  });

  it('dû après une manche passée, tant que la difficulté de la suivante attend le joueur', () => {
    expect(palierDue(session(), null)).toBe(true);
    expect(palierDue(session({ difficultyChoice: null }), null)).toBe(false);
  });

  it('jamais à la première manche, une fois quitté par « Suite », ni la manche commencée', () => {
    expect(palierDue(session({ round: { round: 1, score: 0, objective: 225, maxScore: 500 }, passedRounds: [] }), null)).toBe(false);
    expect(palierDue(session(), 2)).toBe(false);
    expect(palierDue(session({ roundTracks: [{ position: 6, round: 2, neutralized: false, artistCorrect: true, titleCorrect: true, points: 133,
      artist: 'A', title: 'T', coverUrl: null, deezerTrackId: 1, waveform: null }] }), null)).toBe(false);
  });

  it('l\'objectif montré : celui de « Normal », sinon celui de la manche', () => {
    expect(nextObjective(session())).toBe(366);
    expect(nextObjective(session({ difficultyChoice: null, round: { round: 2, score: 0, objective: 400, maxScore: 665 } }))).toBe(400);
  });
});

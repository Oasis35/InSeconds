import {
  RunPlay, RunRound, RunRoundSummary, RunSession, RunTrack, finishSquares, gainLabel, isFinished, objectiveBar, objectiveReached, pillOf, playSteps,
  playedCount, trackPills,
} from './run';

const played = (artistCorrect: boolean, titleCorrect: boolean, neutralized = false) => ({ neutralized, artistCorrect, titleCorrect });

describe('objectiveBar', () => {
  it('place le score et le trait de l\'objectif sur le maximum de la manche', () => {
    expect(objectiveBar({ score: 200, objective: 333, maxScore: 500 })).toEqual({ scoreRatio: 0.4, objectiveRatio: 0.666 });
  });

  it('ne dépasse jamais la barre', () => {
    expect(objectiveBar({ score: 700, objective: 600, maxScore: 500 })).toEqual({ scoreRatio: 1, objectiveRatio: 1 });
  });

  it('une manche sans maximum (tout neutralisé) laisse la barre vide', () => {
    expect(objectiveBar({ score: 0, objective: 0, maxScore: 0 })).toEqual({ scoreRatio: 0, objectiveRatio: 0 });
  });
});

describe('objectiveReached', () => {
  it('atteint dès que le score égale l\'objectif', () => {
    expect(objectiveReached({ score: 333, objective: 333 })).toBe(true);
    expect(objectiveReached({ score: 332, objective: 333 })).toBe(false);
  });
});

describe('pastilles', () => {
  it('un morceau trouvé, à moitié, raté ou retiré a sa pastille', () => {
    expect(pillOf(played(true, true))).toBe('found');
    expect(pillOf(played(true, false))).toBe('half');
    expect(pillOf(played(false, true))).toBe('half');
    expect(pillOf(played(false, false))).toBe('missed');
    expect(pillOf(played(true, true, true))).toBe('neutralized');
  });

  it('les morceaux joués, puis le morceau en cours, puis ceux qui restent', () => {
    expect(trackPills(5, [played(true, true), played(true, false)], true)).toEqual(['found', 'half', 'current', 'todo', 'todo']);
  });

  it('sans morceau en cours (réponse affichée), la suite reste à jouer', () => {
    expect(trackPills(5, [played(true, true), played(false, false), played(true, true)], false)).toEqual(['found', 'missed', 'found', 'todo', 'todo']);
  });

  it('une manche entièrement jouée n\'a plus de morceau en cours', () => {
    expect(trackPills(2, [played(true, true), played(true, true)], true)).toEqual(['found', 'found']);
  });
});

describe('libellés et états', () => {
  it('« +67 »', () => expect(gainLabel(67)).toBe('+67'));

  it('une partie en cours n\'est pas finie, les autres le sont', () => {
    expect(isFinished({ status: 'pending' })).toBe(false);
    expect(isFinished({ status: 'won' })).toBe(true);
    expect(isFinished({ status: 'lost' })).toBe(true);
    expect(isFinished({ status: 'abandoned' })).toBe(true);
  });
});

const track = (position: number, overrides: Partial<RunTrack> = {}): RunTrack => ({
  position, round: Math.ceil(position / 5), neutralized: false, artistCorrect: true, titleCorrect: true, points: 100,
  artist: 'Daft Punk', title: 'One More Time', coverUrl: null, deezerTrackId: 1, ...overrides,
});
const withdrawn = (position: number): RunTrack => track(position, {
  neutralized: true, artistCorrect: false, titleCorrect: false, points: 0, artist: null, title: null, deezerTrackId: null,
});
const round = (overrides: Partial<RunRound> = {}): RunRound => ({ round: 1, score: 0, objective: 200, maxScore: 500, ...overrides });
const session = (overrides: Partial<RunSession> = {}): RunSession => ({
  sessionId: 1, challengeCode: 'ABC234', status: 'pending', rounds: 4, tracksPerRound: 5, listenSeconds: 10, totalScore: 0, roundsPassed: 0,
  round: round(), roundTracks: [], finish: null, ...overrides,
});
const summary = (overrides: Partial<RunRoundSummary> = {}): RunRoundSummary => ({
  round: 1, passed: true, score: 400, objective: 200, tracks: [1, 2, 3, 4, 5].map(p => track(p)), totalScore: 400, ...overrides,
});
const play = (overrides: Partial<RunPlay> = {}): Pick<RunPlay, 'session' | 'revealed' | 'neutralized' | 'roundSummaries'> => ({
  session: session(), revealed: null, neutralized: [], roundSummaries: [], ...overrides,
});

describe('playSteps', () => {
  it('une réponse au milieu de la manche : sa carte seule, avec la manche à jour', () => {
    const steps = playSteps(play({
      session: session({ round: round({ score: 200 }), roundTracks: [track(1), track(2)] }),
      revealed: track(2),
    }), round({ score: 100 }));

    expect(steps).toEqual([{ kind: 'revealed', track: track(2), round: round({ score: 200 }), tracks: [track(1), track(2)] }]);
  });

  it('la dernière réponse de la manche : sa carte (manche du bilan), puis le bilan', () => {
    const steps = playSteps(play({
      session: session({ round: round({ round: 2, objective: 333, maxScore: 665 }), roundTracks: [] }),
      revealed: track(5),
      roundSummaries: [summary()],
    }), round({ score: 300 }));

    expect(steps.map(s => s.kind)).toEqual(['revealed', 'summary']);
    expect(steps[0].round).toEqual({ round: 1, score: 400, objective: 200, maxScore: 500 });
    expect(steps[1].round).toEqual({ round: 1, score: 400, objective: 200, maxScore: 500 });
  });

  it('une manche ratée a son bilan aussi, avant la fin', () => {
    const steps = playSteps(play({
      session: session({ status: 'lost', round: null }),
      revealed: track(5, { points: 0 }),
      roundSummaries: [summary({ passed: false, score: 100 })],
    }), round({ score: 100 }));

    expect(steps.map(s => s.kind)).toEqual(['revealed', 'summary']);
  });

  it('un morceau retiré après la réponse : la carte de réponse avec l\'ancien objectif, puis le retrait avec le nouveau', () => {
    const steps = playSteps(play({
      session: session({ round: round({ score: 200, objective: 160, maxScore: 400 }), roundTracks: [track(1), track(2), withdrawn(3)] }),
      revealed: track(2),
      neutralized: [{ position: 3, round: 1, objectiveBefore: 200, objectiveAfter: 160 }],
    }), round({ score: 100 }));

    expect(steps.map(s => s.kind)).toEqual(['revealed', 'neutralized']);
    expect(steps[0].round).toEqual({ round: 1, score: 200, objective: 200, maxScore: 500 });
    expect(steps[1]).toEqual({
      kind: 'neutralized', position: 3, objectiveBefore: 200, round: { round: 1, score: 200, objective: 160, maxScore: 400 },
      tracks: [track(1), track(2), withdrawn(3)],
    });
  });

  it('le dernier morceau de la manche retiré pendant la redemande d\'extrait : le retrait, puis le bilan', () => {
    const steps = playSteps(play({
      session: session({ round: round({ round: 2, objective: 333, maxScore: 665 }), roundTracks: [] }),
      neutralized: [{ position: 5, round: 1, objectiveBefore: 200, objectiveAfter: 160 }],
      roundSummaries: [summary({ score: 400, objective: 160, tracks: [1, 2, 3, 4].map(p => track(p)).concat(withdrawn(5)) })],
    }), round({ score: 400 }));

    expect(steps.map(s => s.kind)).toEqual(['neutralized', 'summary']);
    expect(steps[0].round).toEqual({ round: 1, score: 400, objective: 160, maxScore: 400 });
    expect(steps[1].round.maxScore).toBe(400);
  });

  it('le premier morceau de la manche suivante retiré après la dernière réponse : la carte, le bilan, puis le retrait', () => {
    const steps = playSteps(play({
      session: session({ round: round({ round: 2, objective: 266, maxScore: 532 }), roundTracks: [withdrawn(6)] }),
      revealed: track(5),
      neutralized: [{ position: 6, round: 2, objectiveBefore: 333, objectiveAfter: 266 }],
      roundSummaries: [summary()],
    }), round({ score: 300 }));

    expect(steps.map(s => s.kind)).toEqual(['revealed', 'summary', 'neutralized']);
    expect(steps[2]).toMatchObject({ kind: 'neutralized', round: { round: 2, score: 0, objective: 266, maxScore: 532 }, tracks: [withdrawn(6)] });
  });

  it('rien à montrer au lancement : aucune étape', () => {
    expect(playSteps(play(), null)).toEqual([]);
  });
});

describe('playedCount', () => {
  it('compte les manches passées puis les morceaux de la manche en cours', () => {
    expect(playedCount({ round: round({ round: 3 }), tracksPerRound: 5, roundTracks: [track(11), track(12)] })).toBe(12);
    expect(playedCount({ round: null, tracksPerRound: 5, roundTracks: [] })).toBe(0);
  });
});

describe('finishSquares', () => {
  it('un carré par morceau, groupé par manche ; une manche non jouée en carrés vides', () => {
    const squares = finishSquares({
      trackCount: 10,
      rounds: [{ round: 1, score: 300, objective: 200, passed: true }, { round: 2, score: null, objective: null, passed: false }],
      tracks: [track(1), track(2, { titleCorrect: false }), withdrawn(3), track(4), track(5)],
    });

    expect(squares).toEqual([
      ['found', 'played', 'neutralized', 'found', 'found'],
      ['unplayed', 'unplayed', 'unplayed', 'unplayed', 'unplayed'],
    ]);
  });
});

import {
  RunPassedRound, RunPlay, RunRound, RunRoundSummary, RunSession, RunTrack, clockLabel, finishSquares, gainLabel, isFinished, objectiveBar,
  comboOf, daysLeft, duelOf, levelDeltaText, ghostGap, playSteps, playedCount, pointsToGo, runPile, runSegments, stepPosition,
} from './run';

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

describe('barre du run', () => {
  it('les manches passées pleines, la manche en cours remplie de son score avec le trait de l\'objectif, les suivantes fermées', () => {
    expect(runSegments(4, { round: 2, score: 100, objective: 250, maxScore: 500 })).toEqual([
      { state: 'done', fill: 1, mark: null },
      { state: 'current', fill: 0.2, mark: 0.5 },
      { state: 'locked', fill: 0, mark: null },
      { state: 'locked', fill: 0, mark: null },
    ]);
  });

  it('sans manche affichée, tout est fermé', () => {
    expect(runSegments(2, null).map(s => s.state)).toEqual(['locked', 'locked']);
  });

  it('ce qui manque pour passer, jamais négatif', () => {
    expect(pointsToGo({ score: 120, objective: 200 })).toBe(80);
    expect(pointsToGo({ score: 260, objective: 200 })).toBe(0);
  });
});

describe('chrono', () => {
  it('« 0:45 », « 0:04 », « 1:05 » ; arrondi à la seconde supérieure, jamais négatif', () => {
    expect(clockLabel(45)).toBe('0:45');
    expect(clockLabel(3.2)).toBe('0:04');
    expect(clockLabel(65)).toBe('1:05');
    expect(clockLabel(-1)).toBe('0:00');
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
  artist: 'Daft Punk', title: 'One More Time', coverUrl: null, deezerTrackId: 1, waveform: null, ...overrides,
});
const withdrawn = (position: number): RunTrack => track(position, {
  neutralized: true, artistCorrect: false, titleCorrect: false, points: 0, artist: null, title: null, deezerTrackId: null,
});
const round = (overrides: Partial<RunRound> = {}): RunRound => ({ round: 1, score: 0, objective: 200, maxScore: 500, ...overrides });
const session = (overrides: Partial<RunSession> = {}): RunSession => ({
  sessionId: 1, challengeCode: 'ABC234', status: 'pending', rounds: 4, tracksPerRound: 5, listenSeconds: 10, totalScore: 0, roundsPassed: 0,
  round: round(), roundTracks: [], finish: null, answerSeconds: 45, clockRemainingSeconds: null, playedTracks: [], passedRounds: [],
  difficultyChoice: null, hand: [], swapAvailable: false, nextDisc: null, cardValues: null, ghost: null, themes: [], themeChoice: null, ...overrides,
});
const summary = (overrides: Partial<RunRoundSummary> = {}): RunRoundSummary => ({
  round: 1, passed: true, score: 400, objective: 200, totalScore: 400, ...overrides,
});
const play = (overrides: Partial<RunPlay> = {}): Pick<RunPlay, 'session' | 'revealed' | 'neutralized' | 'roundSummaries'> => ({
  session: session(), revealed: null, neutralized: [], roundSummaries: [], ...overrides,
});

describe('playSteps', () => {
  it('une réponse au milieu de la manche : sa réponse seule, avec la manche à jour', () => {
    const steps = playSteps(play({
      session: session({ round: round({ score: 200 }), roundTracks: [track(1), track(2)] }),
      revealed: track(2),
    }), round({ score: 100 }));

    expect(steps).toEqual([{ kind: 'revealed', track: track(2), round: round({ score: 200 }) }]);
    expect(stepPosition(steps[0])).toBe(2);
  });

  it('la dernière réponse de la manche : sa réponse avec la manche du bilan, sans étape de bilan (la ligne de palier le remplace)', () => {
    const steps = playSteps(play({
      session: session({ round: round({ round: 2, objective: 333, maxScore: 665 }), roundTracks: [] }),
      revealed: track(5),
      roundSummaries: [summary()],
    }), round({ score: 300 }));

    expect(steps.map(s => s.kind)).toEqual(['revealed']);
    expect(steps[0].round).toEqual({ round: 1, score: 400, objective: 200, maxScore: 500 });
  });

  it('une manche ratée : la réponse seule, la fin suit', () => {
    const steps = playSteps(play({
      session: session({ status: 'lost', round: null }),
      revealed: track(5, { points: 0 }),
      roundSummaries: [summary({ passed: false, score: 100 })],
    }), round({ score: 100 }));

    expect(steps.map(s => s.kind)).toEqual(['revealed']);
    expect(steps[0].round.score).toBe(100);
  });

  it('un morceau retiré après la réponse : la réponse avec l\'ancien objectif, puis le retrait avec le nouveau', () => {
    const steps = playSteps(play({
      session: session({ round: round({ score: 200, objective: 160, maxScore: 400 }), roundTracks: [track(1), track(2), withdrawn(3)] }),
      revealed: track(2),
      neutralized: [{ position: 3, round: 1, objectiveBefore: 200, objectiveAfter: 160 }],
    }), round({ score: 100 }));

    expect(steps.map(s => s.kind)).toEqual(['revealed', 'neutralized']);
    expect(steps[0].round).toEqual({ round: 1, score: 200, objective: 200, maxScore: 500 });
    expect(steps[1]).toEqual({ kind: 'neutralized', position: 3, objectiveBefore: 200, round: { round: 1, score: 200, objective: 160, maxScore: 400 } });
  });

  it('le dernier morceau de la manche retiré pendant la redemande d\'extrait : le retrait, avec le maximum déduit de l\'objectif', () => {
    const steps = playSteps(play({
      session: session({ round: round({ round: 2, objective: 333, maxScore: 665 }), roundTracks: [] }),
      neutralized: [{ position: 5, round: 1, objectiveBefore: 200, objectiveAfter: 160 }],
      roundSummaries: [summary({ score: 400, objective: 160 })],
    }), round({ score: 400 }));

    expect(steps.map(s => s.kind)).toEqual(['neutralized']);
    expect(steps[0].round).toEqual({ round: 1, score: 400, objective: 160, maxScore: 400 });
  });

  it('le premier morceau de la manche suivante retiré après la dernière réponse : la réponse, puis le retrait dans la nouvelle manche', () => {
    const steps = playSteps(play({
      session: session({ round: round({ round: 2, objective: 266, maxScore: 532 }), roundTracks: [withdrawn(6)] }),
      revealed: track(5),
      neutralized: [{ position: 6, round: 2, objectiveBefore: 333, objectiveAfter: 266 }],
      roundSummaries: [summary()],
    }), round({ score: 300 }));

    expect(steps.map(s => s.kind)).toEqual(['revealed', 'neutralized']);
    expect(steps[1]).toMatchObject({ kind: 'neutralized', round: { round: 2, score: 0, objective: 266, maxScore: 532 } });
  });

  it('rien à montrer au lancement : aucune étape', () => {
    expect(playSteps(play(), null)).toEqual([]);
  });
});

const passed = (round: number, score = 400): RunPassedRound => ({ round, score, objective: 200, disc: { key: 'runs.discs.wax', stars: 0 } });
const keys = (entries: ReturnType<typeof runPile>) =>
  entries.map(e => (e.kind === 'track' ? `${e.track.position}${e.past ? '·' : ''}` : `[${e.passed.round}]`));

describe('runPile', () => {
  const tracks = [1, 2, 3, 4, 5, 6, 7].map(p => track(p));

  it('le plus récent en haut ; chaque manche passée pose sa ligne au-dessus de ses morceaux, grisés', () => {
    expect(keys(runPile(tracks, [passed(1)]))).toEqual(['7', '6', '[1]', '5·', '4·', '3·', '2·', '1·']);
  });

  it('une manche passée sans morceau joué de la suivante : sa ligne en haut', () => {
    expect(keys(runPile(tracks.slice(0, 5), [passed(1)]))).toEqual(['[1]', '5·', '4·', '3·', '2·', '1·']);
  });

  it('l\'étape à l\'écran : son morceau, ceux qui suivent et la ligne de sa manche attendent', () => {
    expect(keys(runPile(tracks.slice(0, 5), [passed(1)], { position: 5, round: 1 }))).toEqual(['4', '3', '2', '1']);
    expect(keys(runPile(tracks, [passed(1)], { position: 6, round: 2 }))).toEqual(['[1]', '5·', '4·', '3·', '2·', '1·']);
  });

  it('les morceaux retirés gardent leur place', () => {
    expect(keys(runPile([track(1), withdrawn(2)], []))).toEqual(['2', '1']);
  });

  it('rien de joué : pile vide', () => {
    expect(runPile([], [])).toEqual([]);
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
      rounds: [{ round: 1, score: 300, objective: 200, passed: true, difficulty: 'safe' }, { round: 2, score: null, objective: null, passed: false, difficulty: null }],
      tracks: [track(1), track(2, { titleCorrect: false }), withdrawn(3), track(4), track(5)],
    });

    expect(squares).toEqual([
      ['found', 'played', 'neutralized', 'found', 'found'],
      ['unplayed', 'unplayed', 'unplayed', 'unplayed', 'unplayed'],
    ]);
  });
});

describe('ghostGap', () => {
  it('l\'écart au dernier morceau répondu : avance, retard ou égalité', () => {
    const ghost = { pseudo: 'Alice', total: 250, stoppedAtRound: null };

    expect(ghostGap({ ghost, totalScore: 310 })).toEqual({ pseudo: 'Alice', total: 250, gap: 60, stoppedAtRound: null });
    expect(ghostGap({ ghost, totalScore: 200 })?.gap).toBe(-50);
    expect(ghostGap({ ghost: { ...ghost, stoppedAtRound: 2 }, totalScore: 250 })).toEqual({ pseudo: 'Alice', total: 250, gap: 0, stoppedAtRound: 2 });
  });

  it('rien sans fantôme', () => {
    expect(ghostGap(null)).toBeNull();
    expect(ghostGap({ ghost: null, totalScore: 100 })).toBeNull();
  });
});

describe('duelOf', () => {
  const ghost = { pseudo: 'Alice', total: 250, stoppedAtRound: null };

  it('le duel d\'une partie finie : l\'avance (positive), le retard (négatif) ou l\'égalité', () => {
    expect(duelOf({ ghost, totalScore: 376, status: 'won' })).toEqual({ pseudo: 'Alice', gap: 126 });
    expect(duelOf({ ghost, totalScore: 210, status: 'lost' })).toEqual({ pseudo: 'Alice', gap: -40 });
    expect(duelOf({ ghost, totalScore: 250, status: 'lost' })?.gap).toBe(0);
  });

  it('un invité garde son pseudo vide', () => {
    expect(duelOf({ ghost: { ...ghost, pseudo: null }, totalScore: 300, status: 'won' })?.pseudo).toBeNull();
  });

  it('rien sans ami, ni pour une partie en cours ou abandonnée', () => {
    expect(duelOf(null)).toBeNull();
    expect(duelOf({ ghost: null, totalScore: 300, status: 'won' })).toBeNull();
    expect(duelOf({ ghost, totalScore: 300, status: 'pending' })).toBeNull();
    expect(duelOf({ ghost, totalScore: 300, status: 'abandoned' })).toBeNull();
  });
});

describe('comboOf', () => {
  const played = (position: number, found: boolean, neutralized = false) => ({ position, neutralized, artistCorrect: found, titleCorrect: found });

  it('les derniers morceaux trouvés d\'affilée, toutes manches confondues, dans l\'ordre des positions', () => {
    expect(comboOf([played(3, true), played(1, false), played(2, true)])).toBe(2);
    expect(comboOf([played(1, true), played(2, true), played(3, false)])).toBe(0);
    expect(comboOf([])).toBe(0);
  });

  it('un morceau retiré ne casse pas la série, un morceau à moitié trouvé la remet à zéro', () => {
    expect(comboOf([played(1, true), played(2, false, true), played(3, true)])).toBe(2);
    expect(comboOf([played(1, true), { position: 2, neutralized: false, artistCorrect: true, titleCorrect: false }])).toBe(0);
  });
});

describe('levelDeltaText', () => {
  const format = (value: number) => String(value);

  it('une hausse avec son signe, une baisse avec un vrai signe moins', () => {
    expect(levelDeltaText(38, format)).toBe('+38');
    expect(levelDeltaText(-12, format)).toBe('−12');
  });

  it('rien pour un niveau inchangé ou hors de la fin de run', () => {
    expect(levelDeltaText(0, format)).toBeNull();
    expect(levelDeltaText(null, format)).toBeNull();
  });
});

describe('daysLeft', () => {
  const now = new Date('2026-11-13T12:00:00Z');

  it('arrondit au-dessus : « expire dans 6 j » tant qu\'il reste un peu plus de 5 jours', () => {
    expect(daysLeft('2026-11-19T00:00:00Z', now)).toBe(6);
    expect(daysLeft('2026-11-20T12:00:00Z', now)).toBe(7);
  });

  it('jamais moins de 1, même passé l\'heure ou avec une date illisible', () => {
    expect(daysLeft('2026-11-13T12:30:00Z', now)).toBe(1);
    expect(daysLeft('2026-11-01T00:00:00Z', now)).toBe(1);
    expect(daysLeft('n\'importe quoi', now)).toBe(1);
  });
});

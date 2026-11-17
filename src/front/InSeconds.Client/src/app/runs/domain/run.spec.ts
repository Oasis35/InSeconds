import {
  roundDots, lostLife, overtook,
  RunPassedRound, RunPlay, RunRound, RunRoundSummary, RunSession, RunTrack, clockLabel, finishSquares, gainLabel, isFinished,
  comboOf, daysLeft, duelOf, levelDeltaText, ghostGap, lifeDots, playSteps, roundEndOf, runPile, stepPosition,
} from './run';

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
const round = (overrides: Partial<RunRound> = {}): RunRound => ({ round: 1, score: 0, listenSeconds: 10, fullPoints: 100, failed: 0, ...overrides });
const session = (overrides: Partial<RunSession> = {}): RunSession => ({
  sessionId: 1, challengeCode: 'ABC234', status: 'pending', tracksPerRound: 5, lives: 3, livesLeft: 3, maxRounds: 0, totalScore: 0, roundsPassed: 0,
  round: round(), roundTracks: [], finish: null, answerSeconds: 45, clockRemainingSeconds: null, playedTracks: [], passedRounds: [],
  ghost: null, themes: [], themeChoice: null, listenLadder: [10, 5, 3, 2, 1, 0.5], ...overrides,
});
const summary = (overrides: Partial<RunRoundSummary> = {}): RunRoundSummary => ({
  round: 1, score: 400, outcome: 'shorter', listenSeconds: 10, nextListenSeconds: 5, tracks: [], totalScore: 400, livesLeft: 3, lifeRegained: false, fullPoints: 100, nextFullPoints: 200, ...overrides,
});
const play = (overrides: Partial<RunPlay> = {}): Pick<RunPlay, 'session' | 'revealed' | 'neutralized' | 'roundSummaries' | 'isResuming'> => ({
  session: session(), revealed: null, neutralized: [], roundSummaries: [], isResuming: false, ...overrides,
});

describe('playSteps', () => {
  it('une réponse : sa réponse seule, avec la manche du morceau', () => {
    const steps = playSteps(play({ revealed: track(2) }));

    expect(steps).toEqual([{ kind: 'revealed', track: track(2), round: 1 }]);
    expect(stepPosition(steps[0])).toBe(2);
  });

  it('une réponse suivie de morceaux retirés : dans l\'ordre des positions', () => {
    const steps = playSteps(play({ revealed: track(2), neutralized: [{ position: 4, round: 1 }, { position: 3, round: 1 }] }));

    expect(steps.map(step => [step.kind, stepPosition(step)])).toEqual([['revealed', 2], ['neutralized', 3], ['neutralized', 4]]);
  });

  it('un retrait sans réponse (extrait redemandé) : le retrait seul', () => {
    expect(playSteps(play({ neutralized: [{ position: 5, round: 1 }] }))).toEqual([{ kind: 'neutralized', position: 5, round: 1 }]);
  });

  it('rien à montrer au lancement : aucune étape', () => {
    expect(playSteps(play())).toEqual([]);
  });
});

describe('roundEndOf', () => {
  it('le dernier bilan de la réponse, quand la partie continue', () => {
    expect(roundEndOf(play({ roundSummaries: [summary({ round: 1 }), summary({ round: 2 })] }))?.round).toBe(2);
  });

  it('rien sans manche terminée', () => {
    expect(roundEndOf(play())).toBeNull();
  });

  it('rien à la reprise : le joueur retrouve sa manche', () => {
    expect(roundEndOf(play({ isResuming: true, roundSummaries: [summary()] }))).toBeNull();
  });

  it('rien quand la partie est finie : la fin s\'affiche à sa place', () => {
    expect(roundEndOf(play({ session: session({ status: 'lost', round: null }), roundSummaries: [summary()] }))).toBeNull();
  });
});

describe('lifeDots', () => {
  it('une pastille par vie de départ, pleine tant qu\'elle reste', () => {
    expect(lifeDots(3, 2)).toEqual([true, true, false]);
    expect(lifeDots(3, 0)).toEqual([false, false, false]);
    expect(lifeDots(0, 0)).toEqual([]);
  });
});

const passed = (round: number, score = 400): RunPassedRound => ({ round, score, listenSeconds: 10, theme: null });
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

describe('finishSquares', () => {
  it('un carré par morceau, groupé par manche ; une manche non jouée en carrés vides', () => {
    const squares = finishSquares({
      trackCount: 10,
      rounds: [{ round: 1, score: 300, listenSeconds: 10, theme: null }, { round: 2, score: null, listenSeconds: 5, theme: null }],
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
    expect(duelOf({ ghost, totalScore: 376, status: 'lost' })).toEqual({ pseudo: 'Alice', gap: 126 });
    expect(duelOf({ ghost, totalScore: 210, status: 'lost' })).toEqual({ pseudo: 'Alice', gap: -40 });
    expect(duelOf({ ghost, totalScore: 250, status: 'lost' })?.gap).toBe(0);
  });

  it('un invité garde son pseudo vide', () => {
    expect(duelOf({ ghost: { ...ghost, pseudo: null }, totalScore: 300, status: 'lost' })?.pseudo).toBeNull();
  });

  it('rien sans ami, ni pour une partie en cours ou abandonnée', () => {
    expect(duelOf(null)).toBeNull();
    expect(duelOf({ ghost: null, totalScore: 300, status: 'lost' })).toBeNull();
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

describe('roundDots, lostLife, overtook', () => {
  const played = (position: number, artistCorrect: boolean, titleCorrect: boolean, neutralized = false) => ({ position, artistCorrect, titleCorrect, neutralized });

  it('une pastille par morceau de la manche : les joués dans l\'ordre, celui en cours, puis ceux à venir', () => {
    expect(roundDots({ tracksPerRound: 3, roundTracks: [] } as never)).toEqual(['current', 'upcoming', 'upcoming']);
    expect(roundDots({ tracksPerRound: 4, roundTracks: [played(2, true, false), played(1, true, true), played(3, false, false, true)] } as never))
      .toEqual(['found', 'half', 'withdrawn', 'current']);
    expect(roundDots({ tracksPerRound: 2, roundTracks: [played(1, true, true), played(2, false, false)] } as never)).toEqual(['found', 'missed']);
  });

  it('une vie perdue : ni une moitié juste ni un morceau retiré', () => {
    expect(lostLife(played(1, false, false))).toBe(true);
    expect(lostLife(played(1, true, false))).toBe(false);
    expect(lostLife(played(1, false, false, true))).toBe(false);
  });

  it('le dépassement : l\'écart passe de nul ou négatif à positif', () => {
    const gap = (value: number) => ({ pseudo: 'A', total: 0, gap: value, stoppedAtRound: null });
    expect(overtook(gap(0), gap(10))).toBe(true);
    expect(overtook(gap(-5), gap(10))).toBe(true);
    expect(overtook(gap(5), gap(10))).toBe(false);
    expect(overtook(null, gap(10))).toBe(false);
    expect(overtook(gap(-5), null)).toBe(false);
  });
});

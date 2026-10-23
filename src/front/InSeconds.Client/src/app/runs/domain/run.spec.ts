import { endsRound, gainLabel, isFinished, objectiveBar, objectiveReached, pillOf, trackPills } from './run';

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

  it('un bilan de manche dans la réponse dit que la manche se termine', () => {
    expect(endsRound({ roundSummaries: [] })).toBe(false);
    expect(endsRound({ roundSummaries: [{ round: 1, passed: true, score: 1, objective: 1, tracks: [], totalScore: 1 }] })).toBe(true);
  });
});

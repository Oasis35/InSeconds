import { DailyScores, addDays, groupViewOf, todayRows, weekDots, weekOf, weekRows } from './group-scores';

const SCORES: DailyScores = {
  day: '2026-11-19', todayRevealed: true, weekDays: 7,
  today: [
    { rank: 1, pseudo: 'Théo', isMe: false, played: true, score: 900 },
    { rank: 2, pseudo: 'Moi', isMe: true, played: true, score: 600 },
    { rank: null, pseudo: 'Sam', isMe: false, played: false, score: null },
  ],
  week: [
    { rank: 1, pseudo: 'Moi', isMe: true, points: 1000, playedDays: ['2026-11-13', '2026-11-19'] },
    { rank: null, pseudo: 'Sam', isMe: false, points: null, playedDays: [] },
  ],
};

describe('group-scores (domaine social)', () => {
  it("la vue de l'adresse : la semaine par défaut, la Survie seulement avec l'accès", () => {
    expect(groupViewOf(null, false)).toBe('week');
    expect(groupViewOf('today', false)).toBe('today');
    expect(groupViewOf('survie', true)).toBe('survie');
    expect(groupViewOf('survie', false)).toBe('week');
    expect(groupViewOf('n-importe', true)).toBe('week');
  });

  it('décale un jour, fin de mois et d\'année comprises', () => {
    expect(addDays('2026-11-19', -6)).toBe('2026-11-13');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('la semaine finit le jour en cours', () => {
    expect(weekOf('2026-11-19', 7)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
  });

  it('un point par jour, allumé les jours joués ; un jour hors de la semaine ne compte pas', () => {
    expect(weekDots('2026-11-19', 7, ['2026-11-13', '2026-11-19', '2026-11-12'])).toEqual([true, false, false, false, false, false, true]);
  });

  it('les lignes de la semaine portent leurs points et leurs jours', () => {
    expect(weekRows(SCORES)).toEqual([
      { rank: 1, pseudo: 'Moi', isMe: true, value: 1000, days: [true, false, false, false, false, false, true] },
      { rank: null, pseudo: 'Sam', isMe: false, value: null, days: [false, false, false, false, false, false, false] },
    ]);
  });

  it('les lignes du jour portent le score, sans jours', () => {
    expect(todayRows(SCORES).map(row => [row.pseudo, row.value, row.days])).toEqual([['Théo', 900, null], ['Moi', 600, null], ['Sam', null, null]]);
  });
});

import { ModeScores, TodayScoreEntry, cardGroupId, groupCardView, playedToday, todayTop } from './group-scores';

const entry = (pseudo: string, rank: number | null, extra: Partial<TodayScoreEntry> = {}): TodayScoreEntry =>
  ({ rank, pseudo, isMe: false, played: rank !== null, score: rank === null ? null : 1000 - rank * 100, ...extra });

const scores = (today: readonly TodayScoreEntry[], todayRevealed = true): ModeScores =>
  ({ day: '2026-11-19', todayRevealed, weekDays: 7, today, week: [] });

describe('group-scores', () => {
  it('compte les membres qui ont fini leur partie du jour', () => {
    const today = [entry('Léa', null, { played: true, score: null }), entry('Sam', null), entry('Moi', null, { isMe: true }), entry('Théo', null, { played: true, score: null })];
    expect(playedToday(scores(today, false))).toEqual({ played: 2, total: 4 });
  });

  it('rien du classement du jour tant que les scores sont cachés', () => {
    expect(todayTop(scores([entry('Léa', 1), entry('Moi', 2, { isMe: true })], false), 4)).toEqual([]);
  });

  it('la tête du classement, sans les membres qui n’ont pas joué', () => {
    const top = todayTop(scores([entry('Léa', 1), entry('Moi', 2, { isMe: true }), entry('Sam', null)]), 4);
    expect(top.map(row => row.pseudo)).toEqual(['Léa', 'Moi']);
  });

  it('le joueur classé plus bas prend la dernière ligne de la carte, avec son vrai rang', () => {
    const today = [entry('A', 1), entry('B', 2), entry('C', 3), entry('D', 4), entry('E', 5), entry('Moi', 6, { isMe: true })];
    const top = todayTop(scores(today), 4);
    expect(top.map(row => `${row.rank} ${row.pseudo}`)).toEqual(['1 A', '2 B', '3 C', '6 Moi']);
  });

  it('les ex aequo gardent leur rang partagé', () => {
    const top = todayTop(scores([entry('A', 1), entry('Moi', 1, { isMe: true }), entry('C', 3)]), 4);
    expect(top.map(row => row.rank)).toEqual([1, 1, 3]);
  });
});

describe('carte amis', () => {
  it('le dernier groupe regardé s\'il en est encore membre, sinon le premier', () => {
    expect(cardGroupId([4, 7], 7)).toBe(7);
    expect(cardGroupId([4, 7], 99)).toBe(4);
    expect(cardGroupId([4, 7], null)).toBe(4);
    expect(cardGroupId([], 7)).toBeNull();
  });

  it('défi à faire : qui a joué, sans aucun score, ceux qui ont joué d\'abord', () => {
    const today = [entry('Sam', null), entry('Moi', null, { isMe: true }), entry('Léa', null, { played: true, score: null })];
    const view = groupCardView({ groupId: 4, name: 'Potes', daily: scores(today, false) });

    expect(view).toEqual({
      kind: 'pending', groupId: 4, name: 'Potes', played: 1, total: 3,
      members: [{ pseudo: 'Léa', isMe: false, played: true }, { pseudo: 'Moi', isMe: true, played: false }, { pseudo: 'Sam', isMe: false, played: false }],
    });
    expect(JSON.stringify(view)).not.toContain('score');
  });

  it('défi fait : le haut du classement du jour', () => {
    const view = groupCardView({ groupId: 4, name: 'Potes', daily: scores([entry('Léa', 1), entry('Moi', 2, { isMe: true }), entry('Sam', null)]) });

    expect(view?.kind).toBe('revealed');
    expect(view?.kind === 'revealed' ? view.top.map(row => row.pseudo) : []).toEqual(['Léa', 'Moi']);
  });

  it('sans le Défi du jour, pas de carte', () => {
    expect(groupCardView({ groupId: 4, name: 'Potes', daily: null })).toBeNull();
  });
});

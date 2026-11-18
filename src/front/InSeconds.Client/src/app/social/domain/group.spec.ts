import { GeneralRanking, GroupRanking, GroupStanding, avatarOf, badgeColor, bestStanding, generalRankOf, movementOf, groupInviteUrl, initialOf, isGroupNameValid, isInviteCode, standingOf } from './group';

describe('group (domaine social)', () => {
  it('accepte un nom de 3 à 40 caractères, aux caractères d\'un pseudo', () => {
    expect(isGroupNameValid('Les potes')).toBe(true);
    expect(isGroupNameValid('  Été-2026_v.2 ')).toBe(true);
    expect(isGroupNameValid('ab')).toBe(false);
    expect(isGroupNameValid('a'.repeat(41))).toBe(false);
    expect(isGroupNameValid('Potes !')).toBe(false);
  });

  it('reconnaît un code d\'invitation', () => {
    expect(isInviteCode('ABCD2345')).toBe(true);
    expect(isInviteCode('abc')).toBe(false);
    expect(isInviteCode('ABCD234/')).toBe(false);
    expect(isInviteCode(null)).toBe(false);
  });

  it('écrit le lien d\'invitation', () => {
    expect(groupInviteUrl('https://inseconds.cc', 'ABCD2345')).toBe('https://inseconds.cc/ranking/join/ABCD2345?utm_source=share');
  });

  it('donne la place du joueur dans un classement', () => {
    const ranking: GroupRanking = {
      groupId: 4, name: 'Potes',
      entries: [
        { rank: 1, pseudo: 'Théo', isMe: false, points: 1910, badge: 'runs.discs.gold' },
        { rank: 2, pseudo: 'Moi', isMe: true, points: 1380, badge: 'runs.discs.silver' },
        { rank: null, pseudo: 'Sam', isMe: false, points: null, badge: null },
      ],
    };
    expect(standingOf(ranking)).toEqual({ groupId: 4, name: 'Potes', rank: 2, members: 3 });
    expect(standingOf({ ...ranking, entries: ranking.entries.slice(2) }).rank).toBeNull();
  });

  it('donne la couleur d\'un badge par son jeton', () => {
    expect(badgeColor('runs.discs.gold')).toBe('var(--disc-gold)');
    expect(badgeColor('runs.discs.double_platinum')).toBe('var(--disc-platinum)');
    expect(badgeColor(null)).toBeNull();
    expect(badgeColor('runs.discs.url(x)')).toBeNull();
  });

  it('prend l\'initiale d\'un pseudo', () => {
    expect(initialOf(' léa')).toBe('L');
    expect(initialOf('')).toBe('?');
  });
});

describe('avatarOf', () => {
  it('donne toujours la même teinte (de 1 à 4) au même pseudo, sans tenir compte de la casse', () => {
    expect(avatarOf('Léa')).toBe(avatarOf(' léa '));
    for (const pseudo of ['Théo', 'Sam', 'Maxime', '', 'Zoé']) expect([1, 2, 3, 4]).toContain(avatarOf(pseudo));
  });
});

describe('bestStanding', () => {
  const standing = (groupId: number, rank: number | null): GroupStanding => ({ groupId, name: `G${groupId}`, rank, members: 5 });

  it('prend le plus petit rang, le premier groupe en cas d\'égalité', () => {
    expect(bestStanding([standing(1, 3), standing(2, 2), standing(3, 2)])?.groupId).toBe(2);
  });

  it('ignore les groupes où il n\'a pas de rang, et rend null sans rien', () => {
    expect(bestStanding([standing(1, null), standing(2, 4)])?.rank).toBe(4);
    expect(bestStanding([standing(1, null)])).toBeNull();
    expect(bestStanding([])).toBeNull();
  });
});

describe('generalRankOf', () => {
  const me = { rank: 14, pseudo: 'Moi', isMe: true, points: 1200, badge: null };
  const other = { rank: 1, pseudo: 'Autre', isMe: false, points: 3000, badge: null };
  const ranking = (overrides: Partial<GeneralRanking>): GeneralRanking =>
    ({ top: [other], around: [me], total: 50, visible: true, canAppear: true, topPercent: 30, ...overrides });

  it('lit sa place quand il apparaît, dans la tête ou autour de lui', () => {
    expect(generalRankOf(ranking({}))).toBe(14);
    expect(generalRankOf(ranking({ top: [{ ...me, rank: 2 }], around: [] }))).toBe(2);
  });

  it('rien tant qu\'il n\'a pas choisi d\'apparaître, ni sans partie finie', () => {
    expect(generalRankOf(ranking({ visible: false }))).toBeNull();
    expect(generalRankOf(ranking({ around: [] }))).toBeNull();
  });
});

describe('movementOf', () => {
  const entry = (pseudo: string, points: number | null, rank: number | null, isMe = false) => ({ rank, pseudo, isMe, points, badge: null });
  const ranking = (entries: ReturnType<typeof entry>[]): GroupRanking => ({ groupId: 4, name: 'Potes', entries });

  it('de la 3e à la 2e place : il avait 1100, a gagné 280, et dépasse Léa (1300) mais pas Théo (1910)', () => {
    const group = ranking([entry('Théo', 1910, 1), entry('Moi', 1380, 2, true), entry('Léa', 1300, 3)]);
    expect(movementOf(group, 280)).toEqual({ from: 3, passed: 'Léa' });
  });

  it('le membre dépassé le plus proche est nommé quand il en dépasse plusieurs', () => {
    const group = ranking([entry('Théo', 1910, 1), entry('Moi', 1380, 2, true), entry('Léa', 1300, 3), entry('Sam', 1000, 4)]);
    expect(movementOf(group, 500)).toEqual({ from: 4, passed: 'Léa' });
  });

  it('rien sans montée : points perdus, partie sans changement, personne dépassé, pas de points', () => {
    const group = ranking([entry('Théo', 1910, 1), entry('Moi', 1380, 2, true), entry('Léa', 1300, 3)]);
    expect(movementOf(group, -50)).toBeNull();
    expect(movementOf(group, 0)).toBeNull();
    expect(movementOf(group, null)).toBeNull();
    expect(movementOf(group, 20)).toBeNull();
    expect(movementOf(ranking([entry('Théo', 1910, 1), entry('Moi', null, null, true)]), 100)).toBeNull();
  });

  it('standingOf la porte avec le delta', () => {
    const group = ranking([entry('Théo', 1910, 1), entry('Moi', 1380, 2, true), entry('Léa', 1300, 3)]);
    expect(standingOf(group, 280).moved).toEqual({ from: 3, passed: 'Léa' });
    expect(standingOf(group).moved).toBeUndefined();
  });
});

import { GroupRanking, badgeColor, groupInviteUrl, initialOf, isGroupNameValid, isInviteCode, standingOf } from './group';

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

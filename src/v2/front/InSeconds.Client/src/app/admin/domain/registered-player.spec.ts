import { RegisteredPlayer, filterPlayers, toGameStatus } from './registered-player';

function player(overrides: Partial<RegisteredPlayer>): RegisteredPlayer {
  return {
    id: 'a', pseudo: 'Alice', email: 'alice@example.com', createdAt: '2026-09-01T10:00:00Z', lastSeenAt: null,
    gamesPlayed: 0, isAdmin: false, currentStreak: 0, streakFreezes: 0, streakProtected: false, ...overrides,
  };
}

describe('registered-player', () => {
  const alice = player({});
  const bob = player({ id: 'b', pseudo: 'Bob', email: 'bob@test.fr' });
  const nobody = player({ id: 'c', pseudo: null, email: null });

  it('rend tout sans texte', () => {
    expect(filterPlayers([alice, bob], '  ')).toEqual([alice, bob]);
  });

  it('cherche dans le pseudo et l\'email sans tenir compte de la casse', () => {
    expect(filterPlayers([alice, bob], 'ALI')).toEqual([alice]);
    expect(filterPlayers([alice, bob], 'test.fr')).toEqual([bob]);
  });

  it('supporte un pseudo et un email absents', () => {
    expect(filterPlayers([nobody, alice], 'alice')).toEqual([alice]);
  });

  it('ramène un statut inconnu à « Expired »', () => {
    expect(toGameStatus('Completed')).toBe('Completed');
    expect(toGameStatus('Autre')).toBe('Expired');
  });
});

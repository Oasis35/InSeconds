import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DailyClient } from '../../api/daily/api.generated';
import { AdminPlayersApi } from './players.api';

describe('AdminPlayersApi', () => {
  const client = { listRegisteredPlayers: vi.fn(), getPlayerHistory: vi.fn() };

  function create(): AdminPlayersApi {
    TestBed.configureTestingModule({ providers: [{ provide: DailyClient, useValue: client }] });
    return TestBed.inject(AdminPlayersApi);
  }

  it('garde les instants en texte et rend null pour les valeurs absentes', async () => {
    client.listRegisteredPlayers.mockReturnValue(of({
      players: [
        { id: 'a', pseudo: 'Alice', email: 'a@x.fr', createdAt: '2026-09-01T10:00:00+00:00', lastSeenAt: '2026-09-24T09:00:00+00:00', gamesPlayed: 3, isAdmin: true, currentStreak: 2, streakFreezes: 1, streakProtected: false },
        { id: 'b', pseudo: 'Bob', email: 'b@x.fr', createdAt: new Date('2026-09-02T10:00:00Z'), lastSeenAt: undefined, gamesPlayed: 0, isAdmin: false, currentStreak: 0, streakFreezes: 0, streakProtected: true },
      ],
    }));
    const players = await create().list();
    expect(players[0]).toMatchObject({ id: 'a', createdAt: '2026-09-01T10:00:00+00:00', lastSeenAt: '2026-09-24T09:00:00+00:00', isAdmin: true });
    expect(players[1]).toMatchObject({ createdAt: '2026-09-02T10:00:00.000Z', lastSeenAt: null, streakProtected: true });
  });

  it('convertit les parties : jour en texte, score absent en null, statut inconnu en Expired', async () => {
    client.getPlayerHistory.mockReturnValue(of({
      games: [
        { date: '2026-09-24', status: 'Completed', score: 3200, freezesUsed: 1, freezeEarned: true },
        { date: new Date('2026-09-23T00:00:00Z'), status: 'Weird', score: undefined, freezesUsed: 0, freezeEarned: false },
      ],
    }));
    const games = await create().history('a');
    expect(client.getPlayerHistory).toHaveBeenCalledWith('a');
    expect(games).toEqual([
      { date: '2026-09-24', status: 'Completed', score: 3200, freezesUsed: 1, freezeEarned: true },
      { date: '2026-09-23', status: 'Expired', score: null, freezesUsed: 0, freezeEarned: false },
    ]);
  });
});

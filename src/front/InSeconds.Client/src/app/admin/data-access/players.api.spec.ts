import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DailyClient } from '../../api/daily/api.generated';
import { RunsClient } from '../../api/runs/api.generated';
import { AdminPlayersApi } from './players.api';

describe('AdminPlayersApi', () => {
  const client = { listRegisteredPlayers: vi.fn(), getPlayerHistory: vi.fn() };
  const runs = { listRunAccess: vi.fn(), grantRunAccess: vi.fn(), revokeRunAccess: vi.fn() };

  function create(): AdminPlayersApi {
    TestBed.configureTestingModule({
      providers: [{ provide: DailyClient, useValue: client }, { provide: RunsClient, useValue: runs }],
    });
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

  it('lit les comptes autorisés au mode Run en une liste d\'identifiants', async () => {
    runs.listRunAccess.mockReturnValue(of({ entries: [{ playerId: 'a', grantedAt: '2026-10-21T08:00:00+00:00' }, { playerId: 'b', grantedAt: '2026-10-21T09:00:00+00:00' }] }));
    expect(await create().listRunAccess()).toEqual(['a', 'b']);
  });

  it('autorise ou retire l\'accès selon le choix', async () => {
    runs.grantRunAccess.mockReturnValue(of(undefined));
    runs.revokeRunAccess.mockReturnValue(of(undefined));
    const api = create();
    await api.setRunAccess('a', true);
    expect(runs.grantRunAccess).toHaveBeenCalledWith('a');
    await api.setRunAccess('a', false);
    expect(runs.revokeRunAccess).toHaveBeenCalledWith('a');
  });
});

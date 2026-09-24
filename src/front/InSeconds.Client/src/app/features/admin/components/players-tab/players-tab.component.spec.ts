import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { PlayersTabComponent } from './players-tab.component';
import { AdminApiService } from '../../services/admin-api.service';
import { RegisteredPlayerDto } from '../../admin.models';

const PLAYERS: RegisteredPlayerDto[] = [
  { id: 'a', pseudo: 'Alice', email: 'alice@example.com', createdAt: '2026-09-01T10:00:00Z', lastSeenAt: '2026-09-24T09:00:00Z', gamesPlayed: 12, isAdmin: true, currentStreak: 5, streakFreezes: 1, streakProtected: false },
  { id: 'b', pseudo: 'Bob', email: 'bob@test.fr', createdAt: '2026-09-10T10:00:00Z', lastSeenAt: null, gamesPlayed: 0, isAdmin: false, currentStreak: 0, streakFreezes: 1, streakProtected: false },
];

// Même approche que challenges-tab.component.spec.ts : pas de fixture, méthodes/signals
// protégés exercés en bracket-notation (pas besoin de TranslateService).
describe('PlayersTabComponent', () => {
  let component: PlayersTabComponent;
  let getPlayerHistory: jasmine.Spy;

  beforeEach(() => {
    getPlayerHistory = jasmine.createSpy('getPlayerHistory').and.returnValue(of({
      games: [{ date: '2026-09-24', status: 'Completed', score: 3200, freezesUsed: 0, freezeEarned: false }],
    }));
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminApiService, useValue: { registeredPlayers: signal(PLAYERS), registeredPlayersLoading: signal(false), getPlayerHistory } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new PlayersTabComponent());
  });

  it('affiche tous les joueurs sans filtre', () => {
    expect(component['filteredPlayers']().length).toBe(2);
  });

  it('filtre par pseudo ou email, sans tenir compte de la casse', () => {
    component['filter'].set('ALI');
    expect(component['filteredPlayers']().map(p => p.id)).toEqual(['a']);

    component['filter'].set('test.fr');
    expect(component['filteredPlayers']().map(p => p.id)).toEqual(['b']);
  });

  it('toggle charge l\'historique au premier dépliage seulement', () => {
    component['toggle']('a');
    expect(component['expandedId']()).toBe('a');
    expect(component['historyOf']('a')).toEqual([
      { date: '2026-09-24', status: 'Completed', score: 3200, freezesUsed: 0, freezeEarned: false },
    ]);

    component['toggle']('a'); // repli
    expect(component['expandedId']()).toBeNull();
    component['toggle']('a'); // re-dépliage : déjà en mémoire
    expect(getPlayerHistory).toHaveBeenCalledTimes(1);
  });

  it('une seule ligne dépliée à la fois', () => {
    component['toggle']('a');
    component['toggle']('b');
    expect(component['expandedId']()).toBe('b');
    expect(getPlayerHistory).toHaveBeenCalledWith('b');
  });

  it('retente le chargement après une erreur', () => {
    getPlayerHistory.and.returnValue(throwError(() => new Error('500')));
    component['toggle']('a');
    expect(component['historyOf']('a')).toBe('error');

    component['toggle']('a');
    getPlayerHistory.and.returnValue(of({ games: [] }));
    component['toggle']('a');
    expect(component['historyOf']('a')).toEqual([]);
    expect(getPlayerHistory).toHaveBeenCalledTimes(2);
  });
});

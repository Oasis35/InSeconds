import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PlayersTabComponent } from './players-tab.component';
import { AdminApiService } from '../../services/admin-api.service';
import { LanguageService } from '../../../../core/services/language.service';
import { RegisteredPlayerDto } from '../../admin.models';

const PLAYERS: RegisteredPlayerDto[] = [
  { id: 'a', pseudo: 'Alice', email: 'alice@example.com', createdAt: '2026-09-01T10:00:00Z', lastSeenAt: '2026-09-24T09:00:00Z', gamesPlayed: 12, isAdmin: true },
  { id: 'b', pseudo: 'Bob', email: 'bob@test.fr', createdAt: '2026-09-10T10:00:00Z', lastSeenAt: null, gamesPlayed: 0, isAdmin: false },
];

// Même approche que challenges-tab.component.spec.ts : pas de fixture, méthodes/signals
// protégés exercés en bracket-notation (pas besoin de TranslateService).
describe('PlayersTabComponent', () => {
  let component: PlayersTabComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminApiService, useValue: { registeredPlayers: signal(PLAYERS), registeredPlayersLoading: signal(false) } },
        { provide: LanguageService, useValue: { current: signal('fr') } },
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

  it('relativeTime renvoie null si le joueur n\'a jamais été vu', () => {
    expect(component['relativeTime'](null)).toBeNull();
  });

  it('relativeTime formate en heures puis en jours', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    expect(component['relativeTime']('2026-09-24T09:00:00Z', now)).toBe('il y a 3 heures');
    expect(component['relativeTime']('2026-09-23T12:00:00Z', now)).toBe('hier');
  });
});

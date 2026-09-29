import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PlayerSessionService } from './player-session.service';
import { ApiClient } from '../../api/api.generated';

// ApiClient (NSwag) est mocké directement plutôt que testé via HttpTestingController :
// ses méthodes utilisent responseType:"blob" + FileReader (réel, asynchrone dans un
// vrai navigateur de test), ce qui complique inutilement des tests qui ne portent que
// sur la logique de PlayerSessionService elle-même.
describe('PlayerSessionService', () => {
  let service: PlayerSessionService;
  let apiClient: {
    apiPlayersMe: Mock;
    apiAuthLogout: Mock;
    apiPlayersMeEmail: Mock;
    apiAuthEmailChangeConfirm: Mock;
  };
  const fakeId = 'aaaaaaaa-0000-0000-0000-000000000001';

  beforeEach(() => {
    apiClient = {
      apiPlayersMe: vi.fn().mockName('apiPlayersMe'),
      apiAuthLogout: vi.fn().mockName('apiAuthLogout'),
      apiPlayersMeEmail: vi.fn().mockName('apiPlayersMeEmail'),
      apiAuthEmailChangeConfirm: vi.fn().mockName('apiAuthEmailChangeConfirm'),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: apiClient }],
    });
    service = TestBed.inject(PlayerSessionService);
  });

  describe('initial signal values', () => {
    it('should default to guest with no identity', () => {
      expect(service.playerId()).toBeNull();
      expect(service.isGuest()).toBe(true);
      expect(service.email()).toBeNull();
      expect(service.pseudo()).toBeNull();
      expect(service.isLinked()).toBe(false);
    });
  });

  describe('load()', () => {
    it('should populate a guest session', () => {
      apiClient.apiPlayersMe.mockReturnValue(of({ playerId: fakeId, isGuest: true, email: null, pseudo: null }));

      service.load().subscribe();

      expect(service.playerId()).toBe(fakeId);
      expect(service.isGuest()).toBe(true);
      expect(service.isLinked()).toBe(false);
    });

    it('should populate a linked account', () => {
      apiClient.apiPlayersMe.mockReturnValue(of({ playerId: fakeId, isGuest: false, email: 'a@b.com', pseudo: 'Alice' }));

      service.load().subscribe();

      expect(service.isGuest()).toBe(false);
      expect(service.isLinked()).toBe(true);
      expect(service.email()).toBe('a@b.com');
      expect(service.pseudo()).toBe('Alice');
    });

    it('should populate the streak detail (freezes) from the response', () => {
      const streak = {
        status: 'active', streak: 12, freezes: 2, maxFreezes: 2, freezeEveryDays: 7,
        nextFreezeInDays: 2, missedDays: 0, lostStreak: undefined, lastPlayedDate: undefined,
      };
      apiClient.apiPlayersMe.mockReturnValue(of({ playerId: fakeId, isGuest: false, email: 'a@b.com', pseudo: 'Alice', currentStreak: 12, streak }));

      service.load().subscribe();

      expect(service.currentStreak()).toBe(12);
      expect(service.streak()).toEqual(streak);
    });

    it('should populate isAdmin from the response', () => {
      apiClient.apiPlayersMe.mockReturnValue(of({ playerId: fakeId, isGuest: false, email: 'admin@b.com', pseudo: 'Admin', isAdmin: true }));

      service.load().subscribe();

      expect(service.isAdmin()).toBe(true);
    });

    it('should swallow HTTP errors so app bootstrap is not blocked', () => {
      apiClient.apiPlayersMe.mockReturnValue(throwError(() => new Error('network error')));

      let error: any = null;
      let completed = false;
      service.load().subscribe({ error: e => (error = e), complete: () => (completed = true) });

      expect(error).toBeNull();
      expect(completed).toBe(true);
    });
  });

  describe('logout()', () => {
    it('should call apiAuthLogout', () => {
      apiClient.apiAuthLogout.mockReturnValue(of(void 0));

      service.logout().subscribe();

      expect(apiClient.apiAuthLogout).toHaveBeenCalled();
    });
  });

  describe('requestEmailChange()', () => {
    it('should call apiPlayersMeEmail with the new email and not touch the local signal', () => {
      apiClient.apiPlayersMeEmail.mockReturnValue(of({ message: 'ok' }));

      service.requestEmailChange('new@example.com').subscribe();

      expect(apiClient.apiPlayersMeEmail).toHaveBeenCalledWith({ newEmail: 'new@example.com' });
      expect(service.email()).toBeNull();
    });
  });

  describe('confirmEmailChange()', () => {
    it('should call apiAuthEmailChangeConfirm then reload the session', () => {
      apiClient.apiAuthEmailChangeConfirm.mockReturnValue(of({ email: 'new@example.com' }));
      apiClient.apiPlayersMe.mockReturnValue(of({ playerId: fakeId, isGuest: false, email: 'new@example.com', pseudo: 'Alice' }));

      let result: string | undefined;
      service.confirmEmailChange('tok123').subscribe(email => (result = email));

      expect(apiClient.apiAuthEmailChangeConfirm).toHaveBeenCalledWith({ token: 'tok123' });
      expect(result).toBe('new@example.com');
      expect(service.email()).toBe('new@example.com');
    });
  });
});

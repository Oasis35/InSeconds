import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PlayerSessionService } from './player-session.service';
import { ApiClient } from '../../api/api.generated';

// ApiClient (NSwag) est mocké directement plutôt que testé via HttpTestingController :
// ses méthodes utilisent responseType:"blob" + FileReader (réel, asynchrone dans un
// vrai navigateur Karma), ce qui complique inutilement des tests qui ne portent que
// sur la logique de PlayerSessionService elle-même.
describe('PlayerSessionService', () => {
  let service: PlayerSessionService;
  let apiClient: { apiPlayersMe: jasmine.Spy; apiAuthLogout: jasmine.Spy };
  const fakeId = 'aaaaaaaa-0000-0000-0000-000000000001';

  beforeEach(() => {
    apiClient = {
      apiPlayersMe: jasmine.createSpy('apiPlayersMe'),
      apiAuthLogout: jasmine.createSpy('apiAuthLogout'),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: apiClient }],
    });
    service = TestBed.inject(PlayerSessionService);
  });

  describe('initial signal values', () => {
    it('should default to guest with no identity', () => {
      expect(service.playerId()).toBeNull();
      expect(service.isGuest()).toBeTrue();
      expect(service.email()).toBeNull();
      expect(service.pseudo()).toBeNull();
      expect(service.isLinked()).toBeFalse();
    });
  });

  describe('load()', () => {
    it('should populate a guest session', () => {
      apiClient.apiPlayersMe.and.returnValue(of({ playerId: fakeId, isGuest: true, email: null, pseudo: null }));

      service.load().subscribe();

      expect(service.playerId()).toBe(fakeId);
      expect(service.isGuest()).toBeTrue();
      expect(service.isLinked()).toBeFalse();
    });

    it('should populate a linked account', () => {
      apiClient.apiPlayersMe.and.returnValue(
        of({ playerId: fakeId, isGuest: false, email: 'a@b.com', pseudo: 'Alice' })
      );

      service.load().subscribe();

      expect(service.isGuest()).toBeFalse();
      expect(service.isLinked()).toBeTrue();
      expect(service.email()).toBe('a@b.com');
      expect(service.pseudo()).toBe('Alice');
    });

    it('should swallow HTTP errors so app bootstrap is not blocked', () => {
      apiClient.apiPlayersMe.and.returnValue(throwError(() => new Error('network error')));

      let error: any = null;
      let completed = false;
      service.load().subscribe({ error: e => (error = e), complete: () => (completed = true) });

      expect(error).toBeNull();
      expect(completed).toBeTrue();
    });
  });

  describe('logout()', () => {
    it('should call apiAuthLogout', () => {
      apiClient.apiAuthLogout.and.returnValue(of(void 0));

      service.logout().subscribe();

      expect(apiClient.apiAuthLogout).toHaveBeenCalled();
    });
  });
});

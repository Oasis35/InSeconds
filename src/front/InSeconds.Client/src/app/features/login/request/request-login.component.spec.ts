import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RequestLoginComponent } from './request-login.component';
import { ApiClient } from '../../../api/api.generated';
import { PlayerSessionService } from '../../../core/services/player-session.service';

// ApiClient (NSwag) est mocké directement (responseType:"blob" + FileReader rend un
// test via HttpTestingController inutilement complexe pour la logique testée ici).
// Pas de fixture.detectChanges() : le template utilise TranslatePipe (nécessiterait un
// TranslateService complet). Signals/méthodes protégés exercés directement, sans rendu.
describe('RequestLoginComponent', () => {
  let component: RequestLoginComponent;
  let apiClient: { apiAuthMagicLinkRequest: jasmine.Spy; apiAuthDevLogin: jasmine.Spy };
  let playerSession: { load: jasmine.Spy };
  let router: { navigateByUrl: jasmine.Spy };

  beforeEach(() => {
    apiClient = {
      apiAuthMagicLinkRequest: jasmine.createSpy('apiAuthMagicLinkRequest'),
      apiAuthDevLogin: jasmine.createSpy('apiAuthDevLogin'),
    };
    playerSession = { load: jasmine.createSpy('load').and.returnValue(of(void 0)) };
    router = { navigateByUrl: jasmine.createSpy('navigateByUrl') };

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiClient, useValue: apiClient },
        { provide: PlayerSessionService, useValue: playerSession },
        { provide: Router, useValue: router },
      ],
    });

    component = TestBed.runInInjectionContext(() => new RequestLoginComponent());
  });

  describe('submit()', () => {
    it('should mark the email invalid without calling the API', () => {
      component['email'] = 'pas-un-email';
      component.submit();

      expect(component['status']()).toBe('invalid');
      expect(apiClient.apiAuthMagicLinkRequest).not.toHaveBeenCalled();
    });

    it('should call the request endpoint and show the generic message on success', () => {
      apiClient.apiAuthMagicLinkRequest.and.returnValue(of({ message: 'ok' }));

      component['email'] = 'test@example.com';
      component.submit();

      expect(apiClient.apiAuthMagicLinkRequest).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(component['status']()).toBe('sent');
    });

    it('should show the same generic message even on a network error', () => {
      apiClient.apiAuthMagicLinkRequest.and.returnValue(throwError(() => new Error('network error')));

      component['email'] = 'test@example.com';
      component.submit();

      expect(component['status']()).toBe('sent');
    });
  });

  describe('devLogin()', () => {
    it('should call dev-login then reload the session and navigate home', () => {
      apiClient.apiAuthDevLogin.and.returnValue(of(void 0));

      component.devLogin('user1@dev.local');

      expect(apiClient.apiAuthDevLogin).toHaveBeenCalledWith({ email: 'user1@dev.local' });
      expect(playerSession.load).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    });

    it('should set an error status on failure', () => {
      apiClient.apiAuthDevLogin.and.returnValue(throwError(() => new Error('not found')));

      component.devLogin('user1@dev.local');

      expect(component['devLoginStatus']()).toBe('error');
    });
  });
});

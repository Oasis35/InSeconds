import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { VerifyLoginComponent } from './verify-login.component';
import { ApiClient, ApiException } from '../../../api/api.generated';
import { PlayerSessionService } from '../../../core/services/player-session.service';

// ApiClient (NSwag) est mocké directement (responseType:"blob" + FileReader rend un
// test via HttpTestingController inutilement complexe pour la logique testée ici).
describe('VerifyLoginComponent', () => {
  let apiClient: { apiAuthMagicLinkVerify: jasmine.Spy };
  let playerSession: { load: jasmine.Spy };
  let router: { navigateByUrl: jasmine.Spy };

  function apiError(status: number): ApiException {
    return new ApiException('error', status, '', {}, null);
  }

  function setup(token: string | null): VerifyLoginComponent {
    apiClient = { apiAuthMagicLinkVerify: jasmine.createSpy('apiAuthMagicLinkVerify') };
    playerSession = { load: jasmine.createSpy('load').and.returnValue(of(void 0)) };
    router = { navigateByUrl: jasmine.createSpy('navigateByUrl') };

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiClient, useValue: apiClient },
        { provide: PlayerSessionService, useValue: playerSession },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (_: string) => token } } },
        },
      ],
    });

    return TestBed.runInInjectionContext(() => new VerifyLoginComponent());
  }

  it('should start in missingToken state when no token is present', () => {
    const component = setup(null);
    expect(component['state']()).toBe('missingToken');
  });

  it('should start in idle state when a token is present', () => {
    const component = setup('abc123');
    expect(component['state']()).toBe('idle');
  });

  describe('confirm()', () => {
    it('should call verify, then load the session and navigate home on success', () => {
      const component = setup('abc123');
      apiClient.apiAuthMagicLinkVerify.and.returnValue(of({ needsPseudo: false }));

      component.confirm();

      expect(apiClient.apiAuthMagicLinkVerify).toHaveBeenCalledWith({ token: 'abc123', pseudo: undefined });
      expect(playerSession.load).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    });

    it('should switch to needsPseudo when the server asks for one', () => {
      const component = setup('abc123');
      apiClient.apiAuthMagicLinkVerify.and.returnValue(of({ needsPseudo: true }));

      component.confirm();

      expect(component['state']()).toBe('needsPseudo');
    });

    it('should set error state on 400/403', () => {
      const component = setup('abc123');
      apiClient.apiAuthMagicLinkVerify.and.returnValue(throwError(() => apiError(400)));

      component.confirm();

      expect(component['state']()).toBe('error');
    });
  });

  describe('submitPseudo()', () => {
    it('should reject a pseudo with forbidden characters', () => {
      const component = setup('abc123');
      component['pseudo'] = '<script>';
      component.submitPseudo();

      expect(component['state']()).toBe('invalidPseudo');
      expect(apiClient.apiAuthMagicLinkVerify).not.toHaveBeenCalled();
    });

    it('should call verify with the pseudo and navigate home on success', () => {
      const component = setup('abc123');
      apiClient.apiAuthMagicLinkVerify.and.returnValue(of({ needsPseudo: false }));

      component['pseudo'] = 'Alice';
      component.submitPseudo();

      expect(apiClient.apiAuthMagicLinkVerify).toHaveBeenCalledWith({ token: 'abc123', pseudo: 'Alice' });
      expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    });

    it('should set pseudoTaken state on 409', () => {
      const component = setup('abc123');
      apiClient.apiAuthMagicLinkVerify.and.returnValue(throwError(() => apiError(409)));

      component['pseudo'] = 'Alice';
      component.submitPseudo();

      expect(component['state']()).toBe('pseudoTaken');
    });
  });
});

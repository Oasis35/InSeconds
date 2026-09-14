import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConfirmEmailComponent } from './confirm-email.component';
import { PlayerSessionService } from '../../../core/services/player-session.service';

describe('ConfirmEmailComponent', () => {
  let playerSession: { confirmEmailChange: jasmine.Spy };

  function setup(token: string | null): ConfirmEmailComponent {
    playerSession = { confirmEmailChange: jasmine.createSpy('confirmEmailChange') };

    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerSessionService, useValue: playerSession },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (_: string) => token } } },
        },
      ],
    });

    return TestBed.runInInjectionContext(() => new ConfirmEmailComponent());
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
    it('should call confirmEmailChange and switch to success on success', () => {
      const component = setup('abc123');
      playerSession.confirmEmailChange.and.returnValue(of('new@example.com'));

      component.confirm();

      expect(playerSession.confirmEmailChange).toHaveBeenCalledWith('abc123');
      expect(component['state']()).toBe('success');
      expect(component['confirmedEmail']()).toBe('new@example.com');
    });

    it('should switch to invalidOrExpired on 400', () => {
      const component = setup('abc123');
      playerSession.confirmEmailChange.and.returnValue(throwError(() => ({ status: 400 })));

      component.confirm();

      expect(component['state']()).toBe('invalidOrExpired');
    });

    it('should switch to emailTaken on 409', () => {
      const component = setup('abc123');
      playerSession.confirmEmailChange.and.returnValue(throwError(() => ({ status: 409 })));

      component.confirm();

      expect(component['state']()).toBe('emailTaken');
    });

    it('should switch to error on other failures', () => {
      const component = setup('abc123');
      playerSession.confirmEmailChange.and.returnValue(throwError(() => ({ status: 500 })));

      component.confirm();

      expect(component['state']()).toBe('error');
    });

    it('should do nothing when there is no token', () => {
      const component = setup(null);
      component.confirm();
      expect(playerSession.confirmEmailChange).not.toHaveBeenCalled();
    });
  });
});

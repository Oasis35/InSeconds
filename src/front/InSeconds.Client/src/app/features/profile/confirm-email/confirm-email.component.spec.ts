import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConfirmEmailComponent } from './confirm-email.component';
import { PlayerSessionService } from '../../../core/services/player-session.service';

describe('ConfirmEmailComponent', () => {
  let playerSession: {
    confirmEmailChange: Mock;
  };

  function setup(token: string | null): ConfirmEmailComponent {
    playerSession = { confirmEmailChange: vi.fn().mockName('confirmEmailChange') };

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
      playerSession.confirmEmailChange.mockReturnValue(of('new@example.com'));

      component.confirm();

      expect(playerSession.confirmEmailChange).toHaveBeenCalledWith('abc123');
      expect(component['state']()).toBe('success');
      expect(component['confirmedEmail']()).toBe('new@example.com');
    });

    it.each([
      { status: 400, expected: 'invalidOrExpired' },
      { status: 409, expected: 'emailTaken' },
      { status: 500, expected: 'error' },
    ])('should switch to $expected on a $status error', ({ status, expected }) => {
      const component = setup('abc123');
      playerSession.confirmEmailChange.mockReturnValue(throwError(() => ({ status })));

      component.confirm();

      expect(component['state']()).toBe(expected);
    });

    it('should do nothing when there is no token', () => {
      const component = setup(null);
      component.confirm();
      expect(playerSession.confirmEmailChange).not.toHaveBeenCalled();
    });
  });
});

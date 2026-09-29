import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError, Subject } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { PlayerSessionService } from '../../core/services/player-session.service';
import { StreakDto } from '../../core/models/game.models';

class TranslateServiceStub {
  instant(key: string): string {
    return key;
  }
}

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let playerSessionStub: {
    isLinked: ReturnType<typeof signal<boolean>>;
    pseudo: ReturnType<typeof signal<string | null>>;
    email: ReturnType<typeof signal<string | null>>;
    currentStreak: ReturnType<typeof signal<number>>;
    streak: ReturnType<typeof signal<StreakDto | null>>;
    gamesPlayed: ReturnType<typeof signal<number>>;
    updatePseudo: Mock;
    requestEmailChange: Mock;
    logout: Mock;
    load: Mock;
  };
  let router: {
    navigateByUrl: Mock;
  };

  beforeEach(() => {
    playerSessionStub = {
      isLinked: signal(true),
      pseudo: signal<string | null>('Alice'),
      email: signal<string | null>('alice@example.com'),
      currentStreak: signal(5),
      streak: signal<StreakDto | null>(null),
      gamesPlayed: signal(12),
      updatePseudo: vi.fn().mockName('updatePseudo'),
      requestEmailChange: vi.fn().mockName('requestEmailChange'),
      logout: vi.fn().mockName('logout').mockReturnValue(of(void 0)),
      load: vi.fn().mockName('load').mockReturnValue(of(void 0)),
    };
    router = { navigateByUrl: vi.fn().mockName('navigateByUrl') };

    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerSessionService, useValue: playerSessionStub },
        { provide: Router, useValue: router },
        { provide: TranslateService, useClass: TranslateServiceStub },
      ],
    });

    component = TestBed.runInInjectionContext(() => new ProfileComponent());
  });

  describe('freezes row', () => {
    const streak = (freezes: number, nextFreezeInDays: number): StreakDto => ({
      status: 'active', streak: 5, freezes, maxFreezes: 2, freezeEveryDays: 7,
      nextFreezeInDays, missedDays: 0, lostStreak: undefined, lastPlayedDate: undefined,
    });

    it('is hidden before the streak detail is loaded', () => {
      expect(component['maxFreezes']()).toBe(0);
      expect(component['freezesText']()).toBe('');
    });

    it('reads "stock plein" when the stock is full', () => {
      playerSessionStub.streak.set(streak(2, 2));
      expect(component['freezes']()).toBe(2);
      expect(component['freezesText']()).toBe('streakFreeze.profile.full');
    });

    it('reads the next freeze countdown otherwise (singular)', () => {
      playerSessionStub.streak.set(streak(1, 2));
      expect(component['freezesText']()).toBe('streakFreeze.profile.stock.one');
    });

    it('reads the next freeze countdown otherwise (plural, 0 freeze stays singular)', () => {
      playerSessionStub.streak.set(streak(0, 1));
      expect(component['freezesText']()).toBe('streakFreeze.profile.stock.one');
    });
  });

  describe('ngOnInit()', () => {
    it('redirects to /login when the player is a guest', () => {
      playerSessionStub.isLinked.set(false);
      component.ngOnInit();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('does not redirect when the player is linked', () => {
      component.ngOnInit();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('saveDisabled()', () => {
    it('is disabled when unchanged', () => {
      expect(component['saveDisabled']()).toBe(true);
    });

    it('is enabled once the draft differs and is valid', () => {
      component.onPseudoInput('Bob');
      expect(component['saveDisabled']()).toBe(false);
    });

    it('is disabled when the draft is too short', () => {
      component.onPseudoInput('ab');
      expect(component['saveDisabled']()).toBe(true);
    });

    it('is disabled while saving', () => {
      component.onPseudoInput('Bob');
      // Observable qui n'émet jamais : contrairement à `of(...)` (synchrone, résoudrait
      // immédiatement et ferait passer le statut à 'saved' avant l'assertion), ça permet
      // d'observer l'état transitoire 'saving' juste après l'appel à savePseudo().
      playerSessionStub.updatePseudo.mockReturnValue(new Subject<string>());
      component.savePseudo();
      expect(component['saveDisabled']()).toBe(true);
    });
  });

  describe('savePseudo()', () => {
    it('sets status to saved on success', () => {
      component.onPseudoInput('Bob');
      playerSessionStub.updatePseudo.mockReturnValue(of('Bob'));

      component.savePseudo();

      expect(component['pseudoStatus']()).toBe('saved');
    });

    it('sets status to taken on 409', () => {
      component.onPseudoInput('Bob');
      playerSessionStub.updatePseudo.mockReturnValue(throwError(() => ({ status: 409 })));

      component.savePseudo();

      expect(component['pseudoStatus']()).toBe('taken');
    });

    it('sets status to error on other failures', () => {
      component.onPseudoInput('Bob');
      playerSessionStub.updatePseudo.mockReturnValue(throwError(() => ({ status: 500 })));

      component.savePseudo();

      expect(component['pseudoStatus']()).toBe('error');
    });
  });

  describe('emailSaveDisabled()', () => {
    it('is disabled when unchanged', () => {
      expect(component['emailSaveDisabled']()).toBe(true);
    });

    it('is enabled once the draft differs and is a valid email', () => {
      component.onEmailInput('bob@example.com');
      expect(component['emailSaveDisabled']()).toBe(false);
    });

    it('is disabled when the draft is not a valid email', () => {
      component.onEmailInput('not-an-email');
      expect(component['emailSaveDisabled']()).toBe(true);
    });

    it('is disabled while sending', () => {
      component.onEmailInput('bob@example.com');
      playerSessionStub.requestEmailChange.mockReturnValue(new Subject<void>());
      component.saveEmail();
      expect(component['emailSaveDisabled']()).toBe(true);
    });
  });

  describe('saveEmail()', () => {
    it('sets status to sent on success', () => {
      component.onEmailInput('bob@example.com');
      playerSessionStub.requestEmailChange.mockReturnValue(of(void 0));

      component.saveEmail();

      expect(component['emailStatus']()).toBe('sent');
    });

    it('sets status to taken on 409', () => {
      component.onEmailInput('bob@example.com');
      playerSessionStub.requestEmailChange.mockReturnValue(throwError(() => ({ status: 409 })));

      component.saveEmail();

      expect(component['emailStatus']()).toBe('taken');
    });

    it('sets status to sameEmail on 400', () => {
      component.onEmailInput('bob@example.com');
      playerSessionStub.requestEmailChange.mockReturnValue(throwError(() => ({ status: 400 })));

      component.saveEmail();

      expect(component['emailStatus']()).toBe('sameEmail');
    });

    it('sets status to error on other failures', () => {
      component.onEmailInput('bob@example.com');
      playerSessionStub.requestEmailChange.mockReturnValue(throwError(() => ({ status: 500 })));

      component.saveEmail();

      expect(component['emailStatus']()).toBe('error');
    });
  });

  describe('logout flow', () => {
    it('opens the confirm sheet on askLogout()', () => {
      component.askLogout();
      expect(component['showLogoutConfirm']()).toBe(true);
    });

    it('closes the confirm sheet without logging out on cancelLogout()', () => {
      component.askLogout();
      component.cancelLogout();
      expect(component['showLogoutConfirm']()).toBe(false);
      expect(playerSessionStub.logout).not.toHaveBeenCalled();
    });

    it('logs out, reloads the session and navigates home on confirmLogout()', () => {
      component.askLogout();
      component.confirmLogout();

      expect(playerSessionStub.logout).toHaveBeenCalled();
      expect(playerSessionStub.load).toHaveBeenCalled();
      expect(component['showLogoutConfirm']()).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    });

    it('sets logoutError and stops loading on confirmLogout() failure', () => {
      playerSessionStub.logout.mockReturnValue(throwError(() => new Error('network error')));

      component.askLogout();
      component.confirmLogout();

      expect(component['loggingOut']()).toBe(false);
      expect(component['logoutError']()).toBe(true);
      expect(component['showLogoutConfirm']()).toBe(true);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('clears logoutError when reopening the confirm sheet via askLogout()', () => {
      playerSessionStub.logout.mockReturnValue(throwError(() => new Error('network error')));
      component.askLogout();
      component.confirmLogout();
      expect(component['logoutError']()).toBe(true);

      component.cancelLogout();
      component.askLogout();

      expect(component['logoutError']()).toBe(false);
    });
  });
});

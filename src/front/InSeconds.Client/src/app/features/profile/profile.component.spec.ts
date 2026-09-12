import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { PlayerSessionService } from '../../core/services/player-session.service';

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
    gamesPlayed: ReturnType<typeof signal<number>>;
    updatePseudo: jasmine.Spy;
    logout: jasmine.Spy;
    load: jasmine.Spy;
  };
  let router: { navigateByUrl: jasmine.Spy };

  beforeEach(() => {
    playerSessionStub = {
      isLinked: signal(true),
      pseudo: signal<string | null>('Alice'),
      email: signal<string | null>('alice@example.com'),
      currentStreak: signal(5),
      gamesPlayed: signal(12),
      updatePseudo: jasmine.createSpy('updatePseudo'),
      logout: jasmine.createSpy('logout').and.returnValue(of(void 0)),
      load: jasmine.createSpy('load').and.returnValue(of(void 0)),
    };
    router = { navigateByUrl: jasmine.createSpy('navigateByUrl') };

    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerSessionService, useValue: playerSessionStub },
        { provide: Router, useValue: router },
        { provide: TranslateService, useClass: TranslateServiceStub },
      ],
    });

    component = TestBed.runInInjectionContext(() => new ProfileComponent());
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
      expect(component['saveDisabled']()).toBeTrue();
    });

    it('is enabled once the draft differs and is valid', () => {
      component.onPseudoInput('Bob');
      expect(component['saveDisabled']()).toBeFalse();
    });

    it('is disabled when the draft is too short', () => {
      component.onPseudoInput('ab');
      expect(component['saveDisabled']()).toBeTrue();
    });

    it('is disabled while saving', () => {
      component.onPseudoInput('Bob');
      playerSessionStub.updatePseudo.and.returnValue(of('Bob'));
      component.savePseudo();
      expect(component['saveDisabled']()).toBeTrue();
    });
  });

  describe('savePseudo()', () => {
    it('sets status to saved on success', () => {
      component.onPseudoInput('Bob');
      playerSessionStub.updatePseudo.and.returnValue(of('Bob'));

      component.savePseudo();

      expect(component['pseudoStatus']()).toBe('saved');
    });

    it('sets status to taken on 409', () => {
      component.onPseudoInput('Bob');
      playerSessionStub.updatePseudo.and.returnValue(throwError(() => ({ status: 409 })));

      component.savePseudo();

      expect(component['pseudoStatus']()).toBe('taken');
    });

    it('sets status to error on other failures', () => {
      component.onPseudoInput('Bob');
      playerSessionStub.updatePseudo.and.returnValue(throwError(() => ({ status: 500 })));

      component.savePseudo();

      expect(component['pseudoStatus']()).toBe('error');
    });
  });

  describe('logout flow', () => {
    it('opens the confirm sheet on askLogout()', () => {
      component.askLogout();
      expect(component['showLogoutConfirm']()).toBeTrue();
    });

    it('closes the confirm sheet without logging out on cancelLogout()', () => {
      component.askLogout();
      component.cancelLogout();
      expect(component['showLogoutConfirm']()).toBeFalse();
      expect(playerSessionStub.logout).not.toHaveBeenCalled();
    });

    it('logs out, reloads the session and navigates home on confirmLogout()', () => {
      component.askLogout();
      component.confirmLogout();

      expect(playerSessionStub.logout).toHaveBeenCalled();
      expect(playerSessionStub.load).toHaveBeenCalled();
      expect(component['showLogoutConfirm']()).toBeFalse();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    });
  });
});

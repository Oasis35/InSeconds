import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { GameFooterComponent } from './game-footer.component';
import { LanguageService } from '../../../../core/services/language.service';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

/** Stub minimal de TranslateService (même approche que language.service.spec.ts). */
class TranslateServiceStub {
  use(_lang: string): void {}
  instant(key: string): string {
    return key;
  }
}

describe('GameFooterComponent', () => {
  let component: GameFooterComponent;
  let language: LanguageService;
  let playerSessionStub: {
    isLinked: ReturnType<typeof signal<boolean>>;
    pseudo: ReturnType<typeof signal<string | null>>;
    load: jasmine.Spy;
    logout: jasmine.Spy;
  };
  let router: { navigateByUrl: jasmine.Spy };

  beforeEach(() => {
    localStorage.clear();

    playerSessionStub = {
      isLinked: signal(false),
      pseudo: signal<string | null>(null),
      load: jasmine.createSpy('load').and.returnValue(of(void 0)),
      logout: jasmine.createSpy('logout').and.returnValue(of(void 0)),
    };
    router = { navigateByUrl: jasmine.createSpy('navigateByUrl') };

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslateService, useClass: TranslateServiceStub },
        { provide: PlayerSessionService, useValue: playerSessionStub },
        { provide: Router, useValue: router },
      ],
    });

    language = TestBed.inject(LanguageService);
    component = TestBed.runInInjectionContext(() => new GameFooterComponent());
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('should expose the current language signal', () => {
    expect(component.currentLang()).toBe('fr');
  });

  describe('toggleLanguage()', () => {
    it('should switch from fr to en', () => {
      component.toggleLanguage();
      expect(component.currentLang()).toBe('en');
      expect(language.current()).toBe('en');
    });

    it('should switch back from en to fr', () => {
      component.toggleLanguage();
      component.toggleLanguage();
      expect(component.currentLang()).toBe('fr');
    });

    it('should persist the chosen language to localStorage', () => {
      component.toggleLanguage();
      expect(localStorage.getItem('lang')).toBe('en');
    });
  });

  describe('onLoginIconClick()', () => {
    it('should navigate to /login when guest', () => {
      component.onLoginIconClick();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
      expect(playerSessionStub.logout).not.toHaveBeenCalled();
    });

    it('should log out and reload the session when linked', () => {
      playerSessionStub.isLinked.set(true);

      component.onLoginIconClick();

      expect(playerSessionStub.logout).toHaveBeenCalled();
      expect(playerSessionStub.load).toHaveBeenCalled();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('loginTooltip()', () => {
    it('should return the generic login label for a guest', () => {
      expect(component.loginTooltip()).toBe('footer.login');
    });

    it('should return the pseudo + logout label for a linked account', () => {
      playerSessionStub.isLinked.set(true);
      playerSessionStub.pseudo.set('Alice');

      expect(component.loginTooltip()).toBe('Alice · footer.logout');
    });
  });
});

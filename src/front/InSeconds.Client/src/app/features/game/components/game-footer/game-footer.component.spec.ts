import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GameFooterComponent } from './game-footer.component';
import { LanguageService } from '../../../../core/services/language.service';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

/** Stub minimal de TranslateService (même approche que language.service.spec.ts) — LanguageService en dépend. */
class TranslateServiceStub {
  use(_lang: string): void {}
}

describe('GameFooterComponent', () => {
  let component: GameFooterComponent;
  let language: LanguageService;

  function setup(isAdmin = false) {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslateService, useClass: TranslateServiceStub },
        { provide: PlayerSessionService, useValue: { isAdmin: signal(isAdmin) } },
      ],
    });

    language = TestBed.inject(LanguageService);
    component = TestBed.runInInjectionContext(() => new GameFooterComponent());
  }

  beforeEach(() => setup());

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

  describe('isAdmin', () => {
    it('should be false for a non-admin account', () => {
      setup(false);
      expect(component.isAdmin()).toBeFalse();
    });

    it('should be true for an admin account', () => {
      setup(true);
      expect(component.isAdmin()).toBeTrue();
    });
  });
});

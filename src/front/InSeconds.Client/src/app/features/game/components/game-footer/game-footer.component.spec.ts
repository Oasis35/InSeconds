import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { GameFooterComponent } from './game-footer.component';
import { LanguageService } from '../../../../core/services/language.service';
import { CookieConsentService } from '../../../../core/services/cookie-consent.service';

/** Stub minimal de TranslateService (même approche que language.service.spec.ts). */
class TranslateServiceStub {
  use(_lang: string): void {}
}

describe('GameFooterComponent', () => {
  let component: GameFooterComponent;
  let language: LanguageService;
  let cookieConsent: jasmine.SpyObj<CookieConsentService>;

  beforeEach(() => {
    localStorage.clear();

    const cookieConsentSpy = jasmine.createSpyObj<CookieConsentService>('CookieConsentService', ['showPreferences']);

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslateService, useClass: TranslateServiceStub },
        { provide: CookieConsentService, useValue: cookieConsentSpy },
      ],
    });

    language = TestBed.inject(LanguageService);
    cookieConsent = TestBed.inject(CookieConsentService) as jasmine.SpyObj<CookieConsentService>;
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

  describe('manageCookies()', () => {
    it('should delegate to CookieConsentService.showPreferences()', () => {
      component.manageCookies();
      expect(cookieConsent.showPreferences).toHaveBeenCalled();
    });
  });
});

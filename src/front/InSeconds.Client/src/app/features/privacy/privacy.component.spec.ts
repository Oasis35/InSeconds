import { TestBed } from '@angular/core/testing';
import { PrivacyComponent } from './privacy.component';
import { CookieConsentService } from '../../core/services/cookie-consent.service';

// Pas de fixture.detectChanges() (même pattern que browser-id/game-footer) : le template
// utilise RouterLink/TranslatePipe, qui exigeraient un Router/TranslateService complets.
// On instancie directement la classe via l'injecteur pour exercer manageCookies().
describe('PrivacyComponent', () => {
  let component: PrivacyComponent;
  let cookieConsent: jasmine.SpyObj<CookieConsentService>;

  beforeEach(() => {
    const cookieConsentSpy = jasmine.createSpyObj<CookieConsentService>('CookieConsentService', ['showPreferences']);

    TestBed.configureTestingModule({
      providers: [{ provide: CookieConsentService, useValue: cookieConsentSpy }],
    });

    cookieConsent = TestBed.inject(CookieConsentService) as jasmine.SpyObj<CookieConsentService>;
    component = TestBed.runInInjectionContext(() => new PrivacyComponent());
  });

  describe('manageCookies()', () => {
    it('should delegate to CookieConsentService.showPreferences()', () => {
      component.manageCookies();
      expect(cookieConsent.showPreferences).toHaveBeenCalled();
    });
  });
});

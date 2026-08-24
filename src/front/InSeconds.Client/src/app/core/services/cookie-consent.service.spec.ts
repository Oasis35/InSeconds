import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import * as CookieConsent from 'vanilla-cookieconsent';
import { CookieConsentService } from './cookie-consent.service';
import { LanguageService } from './language.service';
import { AnalyticsService } from './analytics.service';

/**
 * Traductions minimales valides pour vanilla-cookieconsent (mêmes clés que
 * public/i18n/{fr,en}.json#cookieConsent), volontairement distinctes fr/en pour
 * pouvoir vérifier dans le DOM quelle langue est réellement rendue.
 */
const FR_TRANSLATIONS = {
  cookieConsent: {
    consentModal: {
      title: 'FR titre consentement',
      description: 'FR description',
      acceptAllBtn: 'Tout accepter',
      acceptNecessaryBtn: 'Tout refuser',
      showPreferencesBtn: 'Personnaliser',
    },
    preferencesModal: {
      title: 'FR titre préférences',
      acceptAllBtn: 'Tout accepter',
      acceptNecessaryBtn: 'Tout refuser',
      savePreferencesBtn: 'Enregistrer',
      closeIconLabel: 'Fermer',
      sections: [
        { title: 'Nécessaires', linkedCategory: 'necessary' },
        { title: 'Audience', linkedCategory: 'analytics' },
      ],
    },
  },
};

const EN_TRANSLATIONS = {
  cookieConsent: {
    consentModal: {
      title: 'EN consent title',
      description: 'EN description',
      acceptAllBtn: 'Accept all',
      acceptNecessaryBtn: 'Reject all',
      showPreferencesBtn: 'Customize',
    },
    preferencesModal: {
      title: 'EN preferences title',
      acceptAllBtn: 'Accept all',
      acceptNecessaryBtn: 'Reject all',
      savePreferencesBtn: 'Save',
      closeIconLabel: 'Close',
      sections: [
        { title: 'Necessary', linkedCategory: 'necessary' },
        { title: 'Analytics', linkedCategory: 'analytics' },
      ],
    },
  },
};

/** Stub minimal — même approche que game-footer.component.spec.ts / language.service.spec.ts. */
class TranslateServiceStub {
  use(_lang: string): void {}
  reloadLang(lang: string) {
    return of(lang === 'fr' ? FR_TRANSLATIONS : EN_TRANSLATIONS);
  }
}

describe('CookieConsentService', () => {
  let service: CookieConsentService;
  let language: LanguageService;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'fr';

    // Chrome headless (Karma comme Playwright) expose navigator.webdriver=true, ce qui
    // déclenche le "hideFromBots" par défaut du plugin (run() s'arrête avant de générer le
    // DOM des modales) — sans ce stub, tout appel à showPreferences() plante derrière un
    // run() tronqué. Les tests qui n'ouvrent pas de modale (accept/reject, flag E2E) n'en
    // ont pas besoin mais ne sont pas affectés non plus.
    spyOnProperty(navigator, 'webdriver', 'get').and.returnValue(false);

    const analyticsSpy = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['enable', 'disable']);

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslateService, useClass: TranslateServiceStub },
        { provide: AnalyticsService, useValue: analyticsSpy },
      ],
    });

    language = TestBed.inject(LanguageService);
    analytics = TestBed.inject(AnalyticsService) as jasmine.SpyObj<AnalyticsService>;
    service = TestBed.inject(CookieConsentService);
  });

  afterEach(() => {
    // Le plugin garde un état interne au niveau du module (singleton "window._ccRun") :
    // sans reset, le run() du test suivant serait un no-op silencieux.
    CookieConsent.reset(true);
    document.querySelector('#cc-main')?.remove();
    delete (window as { __disableCookieConsent?: boolean }).__disableCookieConsent;
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('should not run the plugin when __disableCookieConsent is set (flag posé par les fixtures E2E)', async () => {
    (window as { __disableCookieConsent?: boolean }).__disableCookieConsent = true;

    await service.init();

    expect(document.querySelector('#cc-main')).toBeNull();
    expect(analytics.enable).not.toHaveBeenCalled();
  });

  it('should enable analytics when the analytics category is accepted, and disable it when rejected', async () => {
    await service.init();

    CookieConsent.acceptCategory(['necessary', 'analytics']);
    expect(analytics.enable).toHaveBeenCalled();

    CookieConsent.acceptCategory(['necessary']);
    expect(analytics.disable).toHaveBeenCalled();
  });

  it('should render the preferences modal in the language active at boot (autoDetect: document)', async () => {
    await service.init();
    service.showPreferences();

    const title = document.querySelector('#cc-main .pm__title')?.textContent;
    expect(title).toContain('FR titre préférences');
  });

  it('should follow a language switch made after init (LanguageService.use)', async () => {
    await service.init();

    language.use('en');
    TestBed.flushEffects();

    service.showPreferences();
    const title = document.querySelector('#cc-main .pm__title')?.textContent;
    expect(title).toContain('EN preferences title');
  });
});

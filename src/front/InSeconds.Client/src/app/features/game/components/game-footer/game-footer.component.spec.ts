import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { GameFooterComponent } from './game-footer.component';
import { LanguageService } from '../../../../core/services/language.service';

/** Stub minimal de TranslateService (même approche que language.service.spec.ts). */
class TranslateServiceStub {
  use(_lang: string): void {}
}

describe('GameFooterComponent', () => {
  let component: GameFooterComponent;
  let language: LanguageService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslateService, useClass: TranslateServiceStub },
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
});

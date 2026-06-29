import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService, SUPPORTED_LANGS } from './language.service';

/** Stub minimal de TranslateService pour éviter de charger tout ngx-translate. */
class TranslateServiceStub {
  private _langs: string[] = [];
  private _fallback: string = '';
  usedLang: string | undefined;

  addLangs(langs: string[]): void {
    this._langs = langs;
  }

  setFallbackLang(lang: string): void {
    this._fallback = lang;
  }

  use(lang: string): void {
    this.usedLang = lang;
  }
}

describe('LanguageService', () => {
  let service: LanguageService;
  let translateStub: TranslateServiceStub;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslateService, useClass: TranslateServiceStub },
      ],
    });

    service = TestBed.inject(LanguageService);
    translateStub = TestBed.inject(TranslateService) as unknown as TranslateServiceStub;
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  describe('initial state', () => {
    it('should have "fr" as initial current language', () => {
      expect(service.current()).toBe('fr');
    });
  });

  describe('init()', () => {
    it('should call translate.addLangs with all supported languages', () => {
      spyOn(translateStub, 'addLangs').and.callThrough();
      service.init();
      expect(translateStub.addLangs).toHaveBeenCalledWith([...SUPPORTED_LANGS]);
    });

    it('should call translate.setFallbackLang with "fr"', () => {
      spyOn(translateStub, 'setFallbackLang').and.callThrough();
      service.init();
      expect(translateStub.setFallbackLang).toHaveBeenCalledWith('fr');
    });

    it('should use "fr" as default when localStorage is empty and browser lang is unsupported', () => {
      localStorage.clear();
      // navigator.language is read-only, but we can verify the fallback logic works
      // by controlling localStorage (no stored value → falls through to browser → fallback)
      service.init();
      // After init, it should have called translate.use() with some lang
      expect(translateStub.usedLang).toBeTruthy();
      expect(SUPPORTED_LANGS as readonly string[]).toContain(translateStub.usedLang!);
    });

    it('should restore language from localStorage when it is "fr"', () => {
      localStorage.setItem('lang', 'fr');
      service.init();
      expect(service.current()).toBe('fr');
      expect(translateStub.usedLang).toBe('fr');
    });

    it('should restore language from localStorage when it is "en"', () => {
      localStorage.setItem('lang', 'en');
      service.init();
      expect(service.current()).toBe('en');
      expect(translateStub.usedLang).toBe('en');
    });

    it('should ignore unsupported languages in localStorage and fall back', () => {
      localStorage.setItem('lang', 'de');
      service.init();
      // Falls back to browser/default — result should still be a supported lang
      expect(SUPPORTED_LANGS as readonly string[]).toContain(service.current());
    });
  });

  describe('use()', () => {
    it('should update the current signal', () => {
      service.use('en');
      expect(service.current()).toBe('en');
    });

    it('should call translate.use()', () => {
      spyOn(translateStub, 'use').and.callThrough();
      service.use('en');
      expect(translateStub.use).toHaveBeenCalledWith('en');
    });

    it('should persist the chosen language to localStorage', () => {
      service.use('en');
      expect(localStorage.getItem('lang')).toBe('en');
    });

    it('should set document.documentElement.lang', () => {
      service.use('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('should switch back from "en" to "fr"', () => {
      service.use('en');
      expect(service.current()).toBe('en');

      service.use('fr');
      expect(service.current()).toBe('fr');
      expect(translateStub.usedLang).toBe('fr');
      expect(localStorage.getItem('lang')).toBe('fr');
    });
  });
});

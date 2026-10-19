import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService, SUPPORTED_LANGS } from './language.service';
import { MemoryStoragePort, StoragePort } from '../storage/storage.port';

/** Stub minimal de TranslateService pour éviter de charger tout ngx-translate. */
class TranslateServiceStub {
  langs: string[] = [];
  fallback = '';
  usedLang: string | undefined;

  addLangs(langs: string[]): void {
    this.langs = langs;
  }

  setFallbackLang(lang: string): void {
    this.fallback = lang;
  }

  use(lang: string): void {
    this.usedLang = lang;
  }
}

describe('LanguageService', () => {
  let service: LanguageService;
  let translate: TranslateServiceStub;
  let storage: MemoryStoragePort;

  beforeEach(() => {
    document.documentElement.lang = '';
    storage = new MemoryStoragePort();
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslateService, useClass: TranslateServiceStub },
        { provide: StoragePort, useValue: storage },
      ],
    });
    service = TestBed.inject(LanguageService);
    translate = TestBed.inject(TranslateService) as unknown as TranslateServiceStub;
  });

  afterEach(() => (document.documentElement.lang = ''));

  it('déclare les langues gérées et le français en repli', () => {
    service.init();

    expect(translate.langs).toEqual([...SUPPORTED_LANGS]);
    expect(translate.fallback).toBe('fr');
  });

  for (const lang of SUPPORTED_LANGS) {
    it(`reprend la langue mémorisée (${lang})`, () => {
      storage.set('lang', lang);

      service.init();

      expect(service.current()).toBe(lang);
      expect(translate.usedLang).toBe(lang);
      expect(document.documentElement.lang).toBe(lang);
    });
  }

  it('ignore une langue mémorisée non gérée et en choisit une gérée', () => {
    storage.set('lang', 'de');

    service.init();

    expect(SUPPORTED_LANGS as readonly string[]).toContain(service.current());
  });

  it('ne mémorise pas la langue détectée au démarrage (seul un choix explicite l\'est)', () => {
    service.init();

    expect(storage.get('lang')).toBeNull();
  });

  it('applique et mémorise le choix du joueur', () => {
    service.use('en');

    expect(service.current()).toBe('en');
    expect(translate.usedLang).toBe('en');
    expect(storage.get('lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

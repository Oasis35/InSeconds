import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { PageMetaService, normalize } from './page-meta.service';

describe('PageMetaService', () => {
  let service: PageMetaService;
  let doc: Document;

  const canonical = () => doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;
  const robots = () => doc.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? null;
  const ogUrl = () => doc.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ?? null;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', { privacy: { title: 'Confidentialité' }, legal: { title: 'Mentions légales' } });
    translate.use('fr');
    doc = TestBed.inject(DOCUMENT);
    doc.title = 'InSeconds - Blind test musical du jour';
    service = TestBed.inject(PageMetaService);
  });

  afterEach(() => {
    doc.head.querySelector('link[rel="canonical"]')?.remove();
    doc.head.querySelector('meta[name="robots"]')?.remove();
    doc.head.querySelector('meta[property="og:url"]')?.remove();
  });

  it('donne à la racine la canonique du jeu du jour', () => {
    service.apply('/');
    expect(canonical()).toBe('https://inseconds.cc/daily');
    expect(ogUrl()).toBe('https://inseconds.cc/daily');
  });

  it('donne à chaque page publique sa propre canonique, sans query string', () => {
    service.apply('/privacy?utm_source=share');
    expect(canonical()).toBe('https://inseconds.cc/privacy');
    expect(ogUrl()).toBe('https://inseconds.cc/privacy');
    service.apply('/daily/archive/2026-11-08#haut');
    expect(canonical()).toBe('https://inseconds.cc/daily/archive/2026-11-08');
  });

  it('met noindex et retire la canonique des pages privées ou inconnues', () => {
    service.apply('/privacy');
    for (const path of ['/account/profile', '/admin', '/runs/abc123', '/nimporte-quoi']) {
      service.apply(path);
      expect(canonical()).toBeNull();
      expect(robots()).toBe('noindex');
    }
  });

  it('retire noindex quand on revient sur une page publique', () => {
    service.apply('/admin');
    service.apply('/legal');
    expect(robots()).toBeNull();
    expect(canonical()).toBe('https://inseconds.cc/legal');
  });

  it('titre les pages légales puis restaure le titre du site', () => {
    const title = TestBed.inject(Title);
    service.apply('/privacy');
    expect(title.getTitle()).toBe('Confidentialité - InSeconds');
    service.apply('/daily');
    expect(title.getTitle()).toBe('InSeconds - Blind test musical du jour');
  });

  it('normalise les adresses', () => {
    expect(normalize('')).toBe('/daily');
    expect(normalize('/daily/?a=1')).toBe('/daily');
  });
});

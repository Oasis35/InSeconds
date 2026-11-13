import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { PageMetaService, normalize } from './page-meta.service';

const SITE_TAGS: [string, string, string][] = [
  ['name', 'description', 'Description du site'],
  ['property', 'og:title', 'Titre du site'],
  ['property', 'og:description', 'Aperçu du site'],
  ['name', 'twitter:title', 'Titre du site'],
  ['name', 'twitter:description', 'Aperçu du site'],
];

describe('PageMetaService', () => {
  let service: PageMetaService;
  let doc: Document;

  const canonical = () => doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;
  const robots = () => doc.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? null;
  const content = (attr: string, name: string) => doc.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`)?.content ?? null;
  const ogUrl = () => doc.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ?? null;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', { privacy: { title: 'Confidentialité', metaDescription: 'Description vie privée' }, legal: { title: 'Mentions légales', metaDescription: 'Description légale' } });
    translate.use('fr');
    doc = TestBed.inject(DOCUMENT);
    doc.title = 'InSeconds - Blind test musical du jour';
    for (const [attr, name, content] of SITE_TAGS) {
      const tag = doc.createElement('meta');
      tag.setAttribute(attr, name);
      tag.content = content;
      doc.head.appendChild(tag);
    }
    service = TestBed.inject(PageMetaService);
  });

  afterEach(() => {
    doc.head.querySelector('link[rel="canonical"]')?.remove();
    doc.head.querySelector('meta[name="robots"]')?.remove();
    doc.head.querySelector('meta[property="og:url"]')?.remove();
    for (const [attr, name] of SITE_TAGS) doc.head.querySelector(`meta[${attr}="${name}"]`)?.remove();
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
    service.apply('/history/daily/2026-11-08#haut');
    expect(canonical()).toBe('https://inseconds.cc/history/daily/2026-11-08');
  });

  it('met noindex et retire la canonique des pages privées ou inconnues', () => {
    service.apply('/privacy');
    for (const path of ['/account/profile', '/admin', '/setlist/abc123', '/nimporte-quoi']) {
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

  it('reprend titre et description de la page légale dans Open Graph et X, puis restaure ceux du site', () => {
    service.apply('/privacy');
    expect(content('property', 'og:title')).toBe('Confidentialité - InSeconds');
    expect(content('name', 'twitter:title')).toBe('Confidentialité - InSeconds');
    for (const [attr, name] of [['name', 'description'], ['property', 'og:description'], ['name', 'twitter:description']]) {
      expect(content(attr, name)).toBe('Description vie privée');
    }
    service.apply('/daily');
    expect(content('property', 'og:title')).toBe('Titre du site');
    expect(content('name', 'description')).toBe('Description du site');
    expect(content('property', 'og:description')).toBe('Aperçu du site');
  });

  it('setPageText et resetPageText servent aux réponses d\'un jour passé', () => {
    service.setPageText('Blind test du 8 novembre', 'Les réponses du jour');
    expect(TestBed.inject(Title).getTitle()).toBe('Blind test du 8 novembre');
    expect(content('property', 'og:title')).toBe('Blind test du 8 novembre');
    expect(content('property', 'og:description')).toBe('Les réponses du jour');
    service.resetPageText();
    expect(TestBed.inject(Title).getTitle()).toBe('InSeconds - Blind test musical du jour');
    expect(content('name', 'description')).toBe('Description du site');
  });

  it('normalise les adresses', () => {
    expect(normalize('')).toBe('/daily');
    expect(normalize('/daily/?a=1')).toBe('/daily');
    expect(normalize('/privacy//#x')).toBe('/privacy');
    expect(normalize('/?utm_source=share')).toBe('/daily');
  });
});

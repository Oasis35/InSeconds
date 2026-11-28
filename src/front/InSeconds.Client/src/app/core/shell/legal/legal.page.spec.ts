import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { VersionService } from '../../version/version.service';
import { LegalPage } from './legal.page';

describe('LegalPage', () => {
  function render() {
    const version = { allowReload: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService(), { provide: VersionService, useValue: version }] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr);
    translate.use('fr');
    const fixture = TestBed.createComponent(LegalPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { element, version, link: (href: string) => element.querySelector<HTMLAnchorElement>(`a[href="${href}"]`) };
  }

  it('le titre est l\'unique h1, avec le texte des traductions', () => {
    const { element } = render();

    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelector('h1')!.textContent!.trim()).toBe(fr.legal.title);
  });

  it('chaque clé de la page est traduite : aucune clé brute à l\'écran', () => {
    expect(render().element.textContent).not.toMatch(/\blegal\.[a-zA-Z]+(\.[a-zA-Z]+)*\b/);
  });

  it('les sections de l\'éditeur et des contenus musicaux sont là, avec leur texte', () => {
    const { element } = render();
    const headings = Array.from(element.querySelectorAll('h2')).map(h => h.textContent!.trim());

    expect(headings).toEqual([fr.legal.publisher.title, fr.legal.music.title]);
    expect(element.textContent).toContain(fr.legal.publisher.body.split('\n')[0]);
  });

  it("renvoie à la confidentialité, au jeu et à Deezer (nouvel onglet, sans transmettre notre origine)", () => {
    const { link } = render();

    expect(link('/privacy')).not.toBeNull();
    expect(link('/')).not.toBeNull();
    const deezer = link('https://developers.deezer.com/termsofuse')!;
    expect(deezer.target).toBe('_blank');
    expect(deezer.rel).toContain('noopener');
    expect(deezer.rel).toContain('noreferrer');
  });

  it('le contact est une adresse mailto', () => {
    const { link } = render();

    expect(link('mailto:contact@inseconds.cc')!.textContent!.trim()).toBe('contact@inseconds.cc');
  });

  it('page de lecture seule : une nouvelle version s\'applique tout de suite', () => {
    const { version } = render();

    expect(version.allowReload).toHaveBeenCalledTimes(1);
    const [moment] = version.allowReload.mock.calls[0] as [() => string];
    expect(moment()).toBe('now');
  });
});

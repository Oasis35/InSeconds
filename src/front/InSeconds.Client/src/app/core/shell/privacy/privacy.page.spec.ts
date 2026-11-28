import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { VersionService } from '../../version/version.service';
import { PrivacyPage } from './privacy.page';

describe('PrivacyPage', () => {
  function render() {
    const version = { allowReload: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService(), { provide: VersionService, useValue: version }] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', fr);
    translate.use('fr');
    const fixture = TestBed.createComponent(PrivacyPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { element, version, link: (href: string) => element.querySelector<HTMLAnchorElement>(`a[href="${href}"]`) };
  }

  it('le titre est l\'unique h1, avec le texte des traductions', () => {
    const { element } = render();

    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelector('h1')!.textContent!.trim()).toBe(fr.privacy.title);
  });

  it('chaque clé de la page est traduite : aucune clé brute à l\'écran', () => {
    expect(render().element.textContent).not.toMatch(/\bprivacy\.[a-zA-Z]+(\.[a-zA-Z]+)*\b/);
  });

  it('les sept sections du RGPD sont là, dans l\'ordre : responsable, données, cookie, durées, tiers, sécurité, droits', () => {
    const headings = Array.from(render().element.querySelectorAll('h2')).map(h => h.textContent!.trim());

    expect(headings).toEqual([
      fr.privacy.controller.title, fr.privacy.data.title, fr.privacy.cookie.title, fr.privacy.retention.title,
      fr.privacy.thirdParties.title, fr.privacy.security.title, fr.privacy.rights.title,
    ]);
  });

  it('le texte des durées de conservation est celui des traductions, avec la durée d\'inactivité des comptes (3 ans, annoncée au joueur)', () => {
    const text = render().element.textContent!;

    expect(text).toContain(fr.privacy.retention.body.split('\n')[0]);
    expect(fr.privacy.retention.body).toContain('3 ans');
    expect(text).toContain('3 ans');
  });

  it('renvoie aux mentions légales et au jeu', () => {
    const { link } = render();

    expect(link('/legal')!.textContent!.trim()).toBe(fr.privacy.legalLink);
    expect(link('/')).not.toBeNull();
  });

  it('pour exercer ses droits : une adresse mailto', () => {
    expect(render().link('mailto:contact@inseconds.cc')!.textContent!.trim()).toBe(fr.privacy.rights.contactLabel);
  });

  it('page de lecture seule : une nouvelle version s\'applique tout de suite', () => {
    const { version } = render();

    expect(version.allowReload).toHaveBeenCalledTimes(1);
    const [moment] = version.allowReload.mock.calls[0] as [() => string];
    expect(moment()).toBe('now');
  });
});

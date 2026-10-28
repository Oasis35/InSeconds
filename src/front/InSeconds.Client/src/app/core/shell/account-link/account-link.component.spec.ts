import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';
import { AccountLinkComponent } from './account-link.component';

describe('AccountLinkComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'fr' })] });
    const fixture = TestBed.createComponent(AccountLinkComponent);
    fixture.detectChanges();
    const session = TestBed.inject(SessionStore);
    session.markLoaded();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, session };
  }

  it('n’affiche ni initiale ni « Connexion » tant que l’identité n’est pas lue (pas de clignotement pour un compte connecté)', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'fr' })] });
    const fixture = TestBed.createComponent(AccountLinkComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('a[href="/account/profile"]')).toBeNull();
    expect(element.querySelector('a[href="/account/login"]')).toBeNull();

    const session = TestBed.inject(SessionStore);
    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: false });
    session.markLoaded();
    fixture.detectChanges();
    expect(element.querySelector('a[href="/account/profile"]')).not.toBeNull();
  });

  it('propose la connexion à un visiteur', () => {
    const { element } = render();

    expect(element.querySelector('a[href="/account/login"]')).not.toBeNull();
    expect(element.querySelector('a[href="/account/profile"]')).toBeNull();
  });

  it('propose la connexion à un invité', () => {
    const { fixture, element, session } = render();

    session.signedIn({ id: 'p1', pseudo: null, email: null, isGuest: true, isAdmin: false });
    fixture.detectChanges();

    expect(element.querySelector('a[href="/account/login"]')).not.toBeNull();
    expect(element.querySelector('a[href="/account/profile"]')).toBeNull();
  });

  it('montre l\'initiale du pseudo d\'un compte, avec un lien vers le profil', () => {
    const { fixture, element, session } = render();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', { shell: { header: { avatarTitle: 'Mon profil : {{ pseudo }}' } } });
    translate.use('fr');

    session.signedIn({ id: 'p1', pseudo: 'élodie', email: 'e@example.com', isGuest: false, isAdmin: false });
    fixture.detectChanges();

    const avatar = element.querySelector<HTMLAnchorElement>('a[href="/account/profile"]')!;
    expect(avatar.textContent?.trim()).toBe('é');
    expect(avatar.title).toBe('Mon profil : élodie');
    expect(element.querySelector('a[href="/account/login"]')).toBeNull();
  });

  it('repasse sur la connexion à la déconnexion', () => {
    const { fixture, element, session } = render();
    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: false });
    fixture.detectChanges();

    session.signedOut();
    fixture.detectChanges();

    expect(element.querySelector('a[href="/account/profile"]')).toBeNull();
    expect(element.querySelector('a[href="/account/login"]')).not.toBeNull();
  });

  it('écrit « Connexion » en toutes lettres pour un invité', () => {
    const { fixture, element } = render();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('fr', { shell: { header: { login: 'Connexion' } } });
    translate.use('fr');
    fixture.detectChanges();

    expect(element.querySelector('a[href="/account/login"]')?.textContent?.trim()).toBe('Connexion');
  });

  it('« Connexion » est un bouton à contour neutre, comme « Se connecter » sur l’accueil', () => {
    const { element } = render();
    const login = element.querySelector<HTMLAnchorElement>('[data-testid="header-login"]')!;
    const style = getComputedStyle(login);
    expect(style.borderStyle).toBe('solid');
    expect(style.textTransform).toBe('uppercase');
  });

  it('montre le calendrier des jours passés, sauf quand la page demande de le masquer', () => {
    const { fixture, element } = render();
    expect(element.querySelector('a[href="/daily/archive"]')).not.toBeNull();

    fixture.componentRef.setInput('showArchive', false);
    fixture.detectChanges();
    expect(element.querySelector('a[href="/daily/archive"]')).toBeNull();
  });

  it('ajoute le cadenas de l\'admin pour un compte admin seulement', () => {
    const { fixture, element, session } = render();

    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: false });
    fixture.detectChanges();
    expect(element.querySelector('a[href="/admin"]')).toBeNull();

    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: true });
    fixture.detectChanges();
    expect(element.querySelector('a[href="/admin"]')).not.toBeNull();
  });

  it('ne montre aucune lueur ni dégradé', () => {
    const { fixture, element, session } = render();
    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: true });
    fixture.detectChanges();

    const avatar = element.querySelector<HTMLElement>('a[href="/account/profile"]')!;
    expect(getComputedStyle(avatar).boxShadow).toBe('none');
    expect(getComputedStyle(avatar).backgroundImage).toBe('none');
  });
});

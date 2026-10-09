import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
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

  it('n’affiche ni avatar ni lien tant que l’identité n’est pas lue (pas de clignotement pour un compte connecté)', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'fr' })] });
    const fixture = TestBed.createComponent(AccountLinkComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('a')).toBeNull();

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

    session.signedIn({ id: 'p1', pseudo: 'élodie', email: 'e@example.com', isGuest: false, isAdmin: false });
    fixture.detectChanges();

    const avatar = element.querySelector<HTMLAnchorElement>('a[href="/account/profile"]')!;
    expect(avatar.textContent?.trim()).toBe('é');
    expect(avatar.title).toBe('élodie');
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

  it('réduit l\'avatar dans un bandeau (compact)', () => {
    const { fixture, element, session } = render();
    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: false });
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    expect(element.querySelector('a[href="/account/profile"]')?.classList).toContain('app-avatar--compact');
  });
});

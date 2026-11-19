import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';
import { AccountLinkComponent } from './account-link.component';

describe('AccountLinkComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'fr' })] });
    const fixture = TestBed.createComponent(AccountLinkComponent);
    const session = TestBed.inject(SessionStore);
    session.markLoaded();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, session };
  }

  it("ne montre rien tant que l'identité n'est pas lue", () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'fr' })] });
    TestBed.inject(SessionStore).signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: true });
    const fixture = TestBed.createComponent(AccountLinkComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('a')).toBeNull();
  });

  it("ne montre ni initiale ni « Connexion » : le compte est dans la barre du bas, pour un visiteur, un invité ou un compte", () => {
    const { fixture, element, session } = render();
    for (const player of [null, { id: 'p1', pseudo: null, email: null, isGuest: true, isAdmin: false }, { id: 'p2', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: false }]) {
      if (player) session.signedIn(player); else session.signedOut();
      fixture.detectChanges();
      expect(element.querySelector('a')).toBeNull();
    }
  });

  it("ajoute le cadenas de l'admin pour un compte admin seulement", () => {
    const { fixture, element, session } = render();
    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: false });
    fixture.detectChanges();
    expect(element.querySelector('a[href="/admin"]')).toBeNull();

    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: true });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="header-admin"]')).not.toBeNull();
  });

  it('ne montre aucune lueur ni dégradé', () => {
    const { fixture, element, session } = render();
    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: true });
    fixture.detectChanges();
    const lock = element.querySelector<HTMLElement>('a[href="/admin"]')!;
    expect(getComputedStyle(lock).boxShadow).toBe('none');
    expect(getComputedStyle(lock).backgroundImage).toBe('none');
  });
});

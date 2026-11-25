import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';
import { ShellChromeStore } from '../shell-chrome.store';
import { AccountLinkComponent } from './account-link.component';

describe('AccountLinkComponent', () => {
  const admin = { id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: true };

  function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'fr' })] });
    const fixture = TestBed.createComponent(AccountLinkComponent);
    const session = TestBed.inject(SessionStore);
    const chrome = TestBed.inject(ShellChromeStore);
    session.markLoaded();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, session, chrome };
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

  it("ajoute le mot « Admin » pour un compte admin seulement", () => {
    const { fixture, element, session } = render();
    session.signedIn({ id: 'p1', pseudo: 'Alice', email: 'a@example.com', isGuest: false, isAdmin: false });
    fixture.detectChanges();
    expect(element.querySelector('a[href="/admin"]')).toBeNull();

    session.signedIn(admin);
    fixture.detectChanges();
    const link = element.querySelector('[data-testid="header-admin"]');
    expect(link).not.toBeNull();
    // Un mot, pas une icône : c'est le libellé qui fait lire l'accès d'un coup d'œil.
    expect(link!.textContent?.trim()).toBe('shell.header.admin');
    expect(link!.querySelector('svg')).toBeNull();
  });

  it('ne montre aucune lueur ni dégradé', () => {
    const { fixture, element, session } = render();
    session.signedIn(admin);
    fixture.detectChanges();
    const link = element.querySelector<HTMLElement>('a[href="/admin"]')!;
    expect(getComputedStyle(link).boxShadow).toBe('none');
    expect(getComputedStyle(link).backgroundImage).toBe('none');
  });

  describe('le témoin des alertes', () => {
    it("n'affiche pas de point tant que l'état technique n'est pas lu", () => {
      const { fixture, element, session } = render();
      session.signedIn(admin);
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="header-admin-dot"]')).toBeNull();
      expect(element.querySelector('[data-testid="header-admin"]')!.getAttribute('aria-label')).toBeNull();
    });

    it("affiche un point vert, sans nombre, quand tout va bien", () => {
      const { fixture, element, session, chrome } = render();
      session.signedIn(admin);
      chrome.setAdminAlerts(0);
      fixture.detectChanges();

      expect(element.querySelector<HTMLElement>('[data-testid="header-admin-dot"]')!.style.background).toContain('--color-success');
      expect(element.querySelector('[data-testid="header-admin-count"]')).toBeNull();
      expect(element.querySelector('[data-testid="header-admin"]')!.getAttribute('aria-label')).toBe('shell.header.adminOk');
    });

    it("affiche un point rouge et le nombre quand il y a des alertes", () => {
      const { fixture, element, session, chrome } = render();
      session.signedIn(admin);
      chrome.setAdminAlerts(3);
      fixture.detectChanges();

      expect(element.querySelector<HTMLElement>('[data-testid="header-admin-dot"]')!.style.background).toContain('--color-fail');
      expect(element.querySelector('[data-testid="header-admin-count"]')!.textContent?.trim()).toBe('3');
      expect(element.querySelector('[data-testid="header-admin"]')!.getAttribute('aria-label')).toBe('shell.header.adminAlerts');
    });

    it("ne met aucun halo autour du point", () => {
      const { fixture, element, session, chrome } = render();
      session.signedIn(admin);
      chrome.setAdminAlerts(1);
      fixture.detectChanges();

      expect(getComputedStyle(element.querySelector<HTMLElement>('[data-testid="header-admin-dot"]')!).boxShadow).toBe('none');
    });
  });
});

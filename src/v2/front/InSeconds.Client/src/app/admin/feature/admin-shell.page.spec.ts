import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionLoader } from '../../account/data-access/session-loader';
import {
  FakePlayersApi, fakePlayersApi, linkedPlayer, providePlayersApiFake,
} from '../../account/data-access/testing/fake-players-api';
import { SessionStore, SessionPlayer } from '../../core/session/session.store';
import { AdminShellPage } from './admin-shell.page';
import { ADMIN_ROUTES } from './admin.routes';

@Component({ template: '<p id="child">contenu de l\'onglet</p>' })
class ChildComponent {}

describe('AdminShellPage', () => {
  const admin: SessionPlayer = { ...linkedPlayer, isAdmin: true };
  const guest: SessionPlayer = { id: 'g1', pseudo: null, email: null, isGuest: true, isAdmin: false };
  let api: FakePlayersApi;

  async function open(player: SessionPlayer | null, url = '/admin') {
    api = fakePlayersApi({ getMe: vi.fn(async () => player) });
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        providePlayersApiFake(api),
        provideRouter([{ path: 'admin', children: [{ ...ADMIN_ROUTES[0], children: [{ path: '**', component: ChildComponent }] }] }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await TestBed.inject(SessionLoader).ensureLoaded();
    harness.detectChanges();
    return { harness, element: harness.routeNativeElement as HTMLElement, session: TestBed.inject(SessionStore) };
  }

  const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

  it('invite un visiteur à se connecter', async () => {
    const { element } = await open(null);

    expect(text(element)).toContain('admin.notLoggedIn');
    expect(element.querySelector('[data-testid="admin-gate"] a[href="/account/login"]')).not.toBeNull();
    expect(element.querySelector('#child')).toBeNull();
  });

  it('traite un invité comme un visiteur : l\'admin demande un compte', async () => {
    const { element } = await open(guest);

    expect(text(element)).toContain('admin.notLoggedIn');
  });

  it('refuse l\'accès à un compte sans le rôle admin', async () => {
    const { element } = await open(linkedPlayer);

    expect(text(element)).toContain('admin.accessDenied');
    expect(text(element)).not.toContain('admin.notLoggedIn');
    expect(element.querySelector('#child')).toBeNull();
  });

  it('montre les onglets et le contenu à un admin', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    expect(element.querySelector('nav a[href="/admin/catalogue"]')).not.toBeNull();
    expect(element.querySelector('#child')).not.toBeNull();
    expect(text(element)).toContain('admin.logout');
    expect(text(element)).not.toContain('admin.accessDenied');
  });

  it('ne montre rien d\'une décision tant que l\'identité n\'est pas lue', async () => {
    api = fakePlayersApi({ getMe: vi.fn(() => new Promise<SessionPlayer | null>(() => undefined)) });
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), providePlayersApiFake(api), provideRouter([])],
    });
    const fixture = TestBed.createComponent(AdminShellPage);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).not.toContain('admin.notLoggedIn');
    expect(text(element)).not.toContain('admin.accessDenied');
  });

  it('affiche l\'identifiant du navigateur dans tous les cas', async () => {
    const { element } = await open(linkedPlayer);

    expect(element.querySelector('[data-testid="browser-id"]')?.textContent).toBe(linkedPlayer.id.slice(0, 8));
  });

  it('se déconnecte : la session est vidée et l\'écran d\'accès revient', async () => {
    const { harness, element, session } = await open(admin, '/admin/catalogue');

    Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('admin.logout'))!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(api.logout).toHaveBeenCalled();
    expect(session.player()).toBeNull();
    expect(text(element)).toContain('admin.notLoggedIn');
  });
});

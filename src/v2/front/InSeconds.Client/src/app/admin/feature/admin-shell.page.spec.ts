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
import { AdminCounts } from '../data-access/admin-counts';
import { AdminShellPage } from './admin-shell.page';
import { ADMIN_ROUTES } from './admin.routes';

@Component({ template: '<p id="child">contenu de l\'onglet</p>' })
class ChildComponent {}

describe('AdminShellPage', () => {
  const admin: SessionPlayer = { ...linkedPlayer, isAdmin: true };
  const guest: SessionPlayer = { id: 'g1', pseudo: null, email: null, isGuest: true, isAdmin: false };
  let api: FakePlayersApi;

  async function open(player: SessionPlayer | null, url = '/admin', realTabs = false) {
    api = fakePlayersApi({ getMe: vi.fn(async () => player) });
    const routes = realTabs ? ADMIN_ROUTES : [{ ...ADMIN_ROUTES[0], children: [{ path: '**', component: ChildComponent }] }];
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        providePlayersApiFake(api),
        provideRouter([{ path: 'admin', children: routes }]),
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

  it('montre les cinq onglets dans l\'ordre de la v1, le catalogue actif', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('nav a'));
    expect(links.map(a => a.getAttribute('href'))).toEqual(
      ['/admin/dashboard', '/admin/defis', '/admin/catalogue', '/admin/joueurs', '/admin/actions']);
    expect(links.filter(a => a.getAttribute('aria-current') === 'page').map(a => a.getAttribute('href')))
      .toEqual(['/admin/catalogue']);
  });

  it('met la déconnexion sous le contenu de l\'onglet, comme en v1', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    const child = element.querySelector('#child')!;
    const logout = Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('admin.logout'))!;
    expect(child.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('montre le libellé nu de Pool, Défis et Joueurs avant leur première ouverture', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    const labels = Array.from(element.querySelectorAll('nav a')).map(a => a.textContent?.trim());
    expect(labels).toEqual([
      'admin.tabs.dashboard', 'admin.tabs.challengesPlain', 'admin.tabs.poolPlain', 'admin.tabs.playersPlain', 'admin.tabs.actions',
    ]);
  });

  it('montre l\'effectif d\'un onglet dès qu\'il a chargé ses données', async () => {
    const { harness, element } = await open(admin, '/admin/catalogue');
    const counts = TestBed.inject(AdminCounts);

    counts.setPool(55);
    counts.setChallenges(30);
    counts.setPlayers(12);
    harness.detectChanges();

    const labels = Array.from(element.querySelectorAll('nav a')).map(a => a.textContent?.trim());
    expect(labels).toEqual(['admin.tabs.dashboard', 'admin.tabs.challenges', 'admin.tabs.pool', 'admin.tabs.players', 'admin.tabs.actions']);
  });

  it('ne montre pas l\'heure de déploiement quand le build ne la connaît pas', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    expect(element.querySelector('[data-testid="deployed-at"]')).toBeNull();
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

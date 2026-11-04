import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { WIDE_SCREEN } from '../../../core/layout/wide-screen';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionLoader } from '../../../account/data-access/session-loader';
import {
  FakePlayersApi, fakePlayersApi, linkedPlayer, providePlayersApiFake,
} from '../../../account/data-access/testing/fake-players-api';
import { SessionStore, SessionPlayer } from '../../../core/session/session.store';
import { AdminCounts } from '../../data-access/admin-counts';
import { FRONT_BUILD } from '../../data-access/system.store';
import { provideJobsApiFake, fakeJobsApi } from '../../data-access/testing/fake-jobs-api';
import { FakeSystemApi, fakeSystemApi, provideSystemApisFake } from '../../data-access/testing/fake-system-apis';
import { ReloadMoment, VersionService } from '../../../core/version/version.service';
import { AdminShellPage } from './admin-shell.page';
import { ADMIN_ROUTES } from '../admin.routes';
import { provideAdminApi } from '../../data-access/admin-api.providers';

@Component({ template: '<p id="child">contenu de l\'onglet</p>' })
class ChildComponent {}

describe('AdminShellPage', () => {
  const admin: SessionPlayer = { ...linkedPlayer, isAdmin: true };
  const guest: SessionPlayer = { id: 'g1', pseudo: null, email: null, isGuest: true, isAdmin: false };
  let api: FakePlayersApi;
  let system: FakeSystemApi;
  let reloadMoment: (() => ReloadMoment) | null;
  const versionFake = { provide: VersionService, useValue: { allowReload: (moment: () => ReloadMoment) => { reloadMoment = moment; } } };

  beforeEach(() => { reloadMoment = null; });

  async function open(player: SessionPlayer | null, url = '/admin', options: { deployedAt?: string | null; wide?: boolean } = {}) {
    api = fakePlayersApi({ getMe: vi.fn(async () => player) });
    system = fakeSystemApi();
    // Les fournisseurs de la route passent avant ceux du module de test : les faux de l'état technique sont ajoutés à la route.
    const shell = { ...ADMIN_ROUTES[0], providers: [...(ADMIN_ROUTES[0].providers ?? []), provideSystemApisFake(system), provideJobsApiFake(fakeJobsApi())] };
    const routes = [{ ...shell, children: [{ path: '**', component: ChildComponent }] }];
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FRONT_BUILD, useValue: { deployedAt: options.deployedAt ?? null, commit: null, branch: null } },
        providePlayersApiFake(api),
        provideRouter([{ path: 'admin', children: routes }]),
        versionFake,
        { provide: WIDE_SCREEN, useValue: signal(options.wide ?? true) },
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
    expect(element.querySelector('[data-testid="admin-gate"] a[href="/account/login"]')?.classList).toContain('app-button--primary');
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

    expect(element.querySelector('aside nav a[href="/admin/catalogue"]')).not.toBeNull();
    expect(element.querySelector('#child')).not.toBeNull();
    expect(text(element)).toContain('admin.logout');
    expect(text(element)).not.toContain('admin.accessDenied');
  });

  /** Les onglets de la barre de gauche (PC) ; la barre du bas (téléphone) a les mêmes, sans effectif. */
  const sideTabs = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLAnchorElement>('aside nav a'));
  const bottomTabs = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLAnchorElement>('[data-testid="admin-bottom-nav"] a'));

  it('montre les quatre onglets dans leur ordre, à gauche sur PC et en bas sur téléphone, les Morceaux actifs', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    for (const links of [sideTabs(element), bottomTabs(element)]) {
      expect(links.map(a => a.getAttribute('href'))).toEqual(['/admin/dashboard', '/admin/defis', '/admin/catalogue', '/admin/joueurs']);
      expect(links.filter(a => a.getAttribute('aria-current') === 'page').map(a => a.getAttribute('href'))).toEqual(['/admin/catalogue']);
    }
  });

  it('le logo mène au jeu : « IN// » sur téléphone, IN//SECONDS au-dessus des onglets sur PC ; aucun titre « Admin »', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    const logos = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href="/daily"]')).map(a => text(a).trim());
    expect(logos).toEqual(['IN//', 'IN//SECONDS']);
    expect(element.querySelector('h1')).toBeNull();
  });

  it('le panneau technique (déploiement, santé, tâches, CI) est dans la barre de gauche sur PC', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    expect(element.querySelector('aside [data-testid="admin-tech-panel"]')).not.toBeNull();
    expect(element.querySelectorAll('[data-testid="admin-tech-panel"]')).toHaveLength(1);
    expect(system.getInfo).toHaveBeenCalledTimes(1);
  });

  it('sur téléphone, le panneau technique n\'est rendu qu\'une fois déplié sous la ligne du haut', async () => {
    const { harness, element } = await open(admin, '/admin/catalogue', { wide: false });

    expect(element.querySelector('[data-testid="admin-tech-panel"]')).toBeNull();

    (element.querySelector('[data-testid="tech-toggle"]') as HTMLButtonElement).click();
    harness.detectChanges();

    expect(element.querySelector('header [data-testid="admin-tech-panel"]')).not.toBeNull();
    expect(element.querySelectorAll('[data-testid="admin-tech-panel"]')).toHaveLength(1);
  });

  it('ne lit l\'état technique que pour un admin', async () => {
    await open(linkedPlayer);

    expect(system.getInfo).not.toHaveBeenCalled();
  });

  it('montre la date du déploiement en haut sur téléphone, et en grand dans le panneau', async () => {
    const { element } = await open(admin, '/admin/catalogue', { deployedAt: '2026-11-04T09:12:00Z' });

    expect(element.querySelector('[data-testid="deployed-at-short"]')?.textContent).toContain('admin.deployedShort');
    expect(element.querySelector('aside [data-testid="deployed-at"]')).not.toBeNull();
  });

  it('met la déconnexion à la fin du panneau technique', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    const panel = element.querySelector('aside [data-testid="admin-tech-panel"]')!;
    expect(Array.from(panel.querySelectorAll('button')).some(b => b.textContent?.includes('admin.logout'))).toBe(true);
  });

  it('montre le libellé nu de Morceaux, Défis et Joueurs avant leur première ouverture', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    expect(sideTabs(element).map(a => a.textContent?.trim())).toEqual([
      'admin.tabs.dashboard', 'admin.tabs.challengesPlain', 'admin.tabs.poolPlain', 'admin.tabs.playersPlain',
    ]);
  });

  it('montre l\'effectif d\'un onglet dès qu\'il a chargé ses données', async () => {
    const { harness, element } = await open(admin, '/admin/catalogue');
    const counts = TestBed.inject(AdminCounts);

    counts.setPool(55);
    counts.setChallenges(30);
    counts.setPlayers(12);
    harness.detectChanges();

    expect(sideTabs(element).map(a => a.textContent?.trim()))
      .toEqual(['admin.tabs.dashboard', 'admin.tabs.challenges', 'admin.tabs.pool', 'admin.tabs.players']);
    // La barre du bas, étroite, garde les libellés nus.
    expect(bottomTabs(element).map(a => a.textContent?.trim()))
      .toEqual(['admin.tabs.dashboard', 'admin.tabs.challengesPlain', 'admin.tabs.poolPlain', 'admin.tabs.playersPlain']);
  });

  it('ne montre pas l\'heure de déploiement quand le build ne la connaît pas', async () => {
    const { element } = await open(admin, '/admin/catalogue');

    expect(element.querySelector('[data-testid="deployed-at"]')).toBeNull();
  });

  it('ne montre rien d\'une décision tant que l\'identité n\'est pas lue', async () => {
    api = fakePlayersApi({ getMe: vi.fn(() => new Promise<SessionPlayer | null>(() => undefined)) });
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideHttpClient(), provideHttpClientTesting(), providePlayersApiFake(api), provideRouter([]), versionFake,
        provideAdminApi(),
      ],
    });
    const fixture = TestBed.createComponent(AdminShellPage);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).not.toContain('admin.notLoggedIn');
    expect(text(element)).not.toContain('admin.accessDenied');
  });

  it('accepte une nouvelle version en arrière-plan, sauf pendant une saisie', async () => {
    const { element } = await open(admin, '/admin/catalogue');
    const field = document.createElement('input');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    element.querySelector('#child')!.append(field, checkbox);

    expect(reloadMoment!()).toBe('background');

    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(reloadMoment!()).toBe('navigation');

    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    checkbox.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(reloadMoment!()).toBe('background');
  });

  it('garde la saisie en cours quand la fenêtre perd le focus (barre d\'adresse, autre onglet)', async () => {
    const { element } = await open(admin, '/admin/catalogue');
    const field = document.createElement('input');
    element.querySelector('#child')!.append(field);
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(reloadMoment!()).toBe('navigation');

    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(reloadMoment!()).toBe('background');
  });

  it('affiche l\'identifiant du navigateur dans tous les cas', async () => {
    const { element } = await open(linkedPlayer);

    expect(element.querySelector('[data-testid="admin-gate"] [data-testid="browser-id"]')?.textContent).toBe(linkedPlayer.id.slice(0, 8));
  });

  it('relit l\'état technique quand l\'onglet redevient visible', async () => {
    const { harness } = await open(admin, '/admin/catalogue');
    await harness.fixture.whenStable();
    expect(system.getInfo).toHaveBeenCalledTimes(1);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await harness.fixture.whenStable();

    expect(system.getInfo).toHaveBeenCalledTimes(2);
  });

  it('se déconnecte : la session est vidée et l\'écran d\'accès revient', async () => {
    const { harness, element, session } = await open(admin, '/admin/catalogue');
    // Déconnecté, le navigateur n'a plus d'identité : l'écran d'accès (qui montre l'identifiant du navigateur) crée l'invité et relit.
    api.getMe.mockResolvedValue(null);

    Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('admin.logout'))!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(api.logout).toHaveBeenCalled();
    expect(session.player()).toBeNull();
    expect(text(element)).toContain('admin.notLoggedIn');
  });
});

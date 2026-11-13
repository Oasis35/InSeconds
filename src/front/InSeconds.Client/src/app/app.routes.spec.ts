import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PlayersApi } from './account/data-access/players.api';
import { redirectKeepingQuery, redirectRunsLink, routes } from './app.routes';

describe('routes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    // Le profil est réservé aux comptes (garde) : l'API des joueurs répond ici par un compte connecté.
    const linkedPlayer = { id: 'p1', pseudo: 'Alice', email: 'alice@example.com', isGuest: false, isAdmin: false };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideTranslateService(),
        // Service worker absent (comme en dev) : les pages déclarent quand recharger, rien n'est surveillé.
        { provide: SwUpdate, useValue: { isEnabled: false } },
        { provide: PlayersApi, useValue: { getMe: async () => linkedPlayer, listDevices: async () => [] } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  async function landOn(url: string): Promise<string> {
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  // La racine et `/daily` sont la même page : c'est elle qui renvoie la racine au défi quand le joueur n'a pas l'accueil de la V4.
  it('sert l\'accueil sur la racine et le défi sur /daily', async () => {
    expect(await landOn('/')).toBe('/');
    expect(await landOn('/daily')).toBe('/daily');
  });

  // Anciennes adresses : liens partagés, favoris, liens des emails déjà envoyés.
  const legacyRedirects: [string, string][] = [
    ['/blindtest', '/daily'],
    ['/login', '/account/login'],
    ['/login/verify', '/account/login/verify'],
    ['/profile', '/account/profile'],
    ['/profile/confirm-email', '/account/confirm-email'],
    ['/confidentialite', '/privacy'],
    ['/mentions-legales', '/legal'],
    ['/legal-notice', '/legal'],
    ['/history', '/history/daily'],
    ['/daily/history', '/history/daily'],
    ['/daily/archive/2026-11-10', '/history/daily/2026-11-10'],
    ['/setlist/history', '/history/setlist'],
    ['/setlist/history/12', '/history/setlist/12'],
  ];

  for (const [from, to] of legacyRedirects) {
    it(`redirige ${from} vers ${to}`, async () => {
      expect(await landOn(from)).toBe(to);
    });
  }

  it('garde la query string d\'un lien magique', async () => {
    expect(await landOn('/login/verify?token=abc123')).toBe('/account/login/verify?token=abc123');
  });

  it('garde la query string et le fragment de l\'accueil', async () => {
    expect(await landOn('/?from=share&x=1#top')).toBe('/?from=share&x=1#top');
  });

  it('garde la query string d\'un lien de confirmation d\'email', async () => {
    expect(await landOn('/profile/confirm-email?token=t%2B1')).toBe('/account/confirm-email?token=t%2B1');
  });

  it('affiche la page de confidentialité', async () => {
    await harness.navigateByUrl('/privacy');

    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-privacy-page');
    expect(harness.routeNativeElement?.textContent).toContain('privacy.title');
  });

  it('affiche la page des mentions légales', async () => {
    await harness.navigateByUrl('/legal');

    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-legal-page');
    expect(harness.routeNativeElement?.textContent).toContain('legal.title');
  });

  it('affiche les écrans du compte (connexion, vérification, confirmation d\'email)', async () => {
    for (const url of ['/account/login', '/account/login/verify?token=t', '/account/confirm-email?token=t']) {
      await harness.navigateByUrl(url);
      expect(harness.routeNativeElement?.querySelector('app-auth-page'), url).not.toBeNull();
    }
  });

  it('affiche la page 404 pour une adresse inconnue', async () => {
    await harness.navigateByUrl('/nimporte-quoi');

    expect(harness.routeNativeElement?.textContent).toContain('404');
  });

  // Le mode Run s'appelle Setlist : on vérifie les redirections sans charger la page du mode (qui voudrait son client d'API).
  it('route /runs vers /setlist, et /runs/<code> vers /setlist/<code>, query string et fragment gardés', () => {
    expect(routes.find(r => r.path === 'runs')?.redirectTo).toBeDefined();
    expect(routes.find(r => r.path === 'runs/:code')?.redirectTo).toBe(redirectRunsLink);
    const toTree = (fn: unknown, snapshot: object) =>
      TestBed.runInInjectionContext(() => (fn as (s: object) => ReturnType<Router['parseUrl']>)(snapshot)).toString();
    expect(toTree(redirectKeepingQuery('/setlist'), { queryParams: { x: '1' }, fragment: null })).toBe('/setlist?x=1');
    expect(toTree(redirectRunsLink, { params: { code: 'K7Q2M9' }, queryParams: { utm_source: 'share' }, fragment: 'top' }))
      .toBe('/setlist/K7Q2M9?utm_source=share#top');
    expect(routes.find(r => r.path === 'setlist')?.loadChildren).toBeDefined();
  });
});

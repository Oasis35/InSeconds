import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PlayersApi } from './account/data-access/players.api';
import { routes } from './app.routes';

describe('routes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    // Le profil est réservé aux comptes (garde) : l'API des joueurs répond ici par un compte connecté.
    const linkedPlayer = { id: 'p1', pseudo: 'Alice', email: 'alice@example.com', isGuest: false, isAdmin: false };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideTranslateService(),
        { provide: PlayersApi, useValue: { getMe: async () => linkedPlayer, listDevices: async () => [] } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  async function landOn(url: string): Promise<string> {
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  it('envoie l\'accueil sur le défi du jour', async () => {
    expect(await landOn('/')).toBe('/daily');
  });

  // Anciennes adresses v1 : liens partagés, favoris, liens des emails déjà envoyés.
  const legacyRedirects: [string, string][] = [
    ['/blindtest', '/daily'],
    ['/login', '/account/login'],
    ['/login/verify', '/account/login/verify'],
    ['/profile', '/account/profile'],
    ['/profile/confirm-email', '/account/confirm-email'],
    ['/confidentialite', '/privacy'],
    ['/mentions-legales', '/privacy'],
    ['/legal-notice', '/privacy'],
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
    expect(await landOn('/?from=share&x=1#top')).toBe('/daily?from=share&x=1#top');
  });

  it('garde la query string d\'un lien de confirmation d\'email', async () => {
    expect(await landOn('/profile/confirm-email?token=t%2B1')).toBe('/account/confirm-email?token=t%2B1');
  });

  it('affiche la page de confidentialité et mentions légales', async () => {
    await harness.navigateByUrl('/privacy');

    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-privacy-page');
    expect(harness.routeNativeElement?.textContent).toContain('privacy.title');
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
});

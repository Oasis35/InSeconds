import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PlayersApi } from '../../account/data-access/players.api';
import { VersionService } from '../../core/version/version.service';
import { ADMIN_ROUTES } from './admin.routes';

describe('ADMIN_ROUTES', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    // Visiteur sans identité : l'écran d'accès s'affiche, le contenu des onglets n'est jamais instancié.
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'admin', children: ADMIN_ROUTES }]),
        { provide: PlayersApi, useValue: { getMe: async () => null, createGuest: async () => 'g1' } },
        { provide: VersionService, useValue: { allowReload: () => undefined } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  async function landOn(url: string): Promise<string> {
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  it('mène /admin au tableau de bord', async () => {
    expect(await landOn('/admin')).toBe('/admin/dashboard');
  });

  it('redirige l\'ancienne adresse /admin?tab=pool vers le catalogue', async () => {
    expect(await landOn('/admin?tab=pool')).toBe('/admin/catalogue');
  });

  it('redirige l\'ancien /admin/pool vers le catalogue, page de la grille comprise', async () => {
    expect(await landOn('/admin/pool')).toBe('/admin/catalogue');
    expect(await landOn('/admin/pool?page=3')).toBe('/admin/catalogue?page=3');
  });

  it('garde les autres paramètres de l\'ancienne adresse', async () => {
    expect(await landOn('/admin?tab=pool&page=2')).toBe('/admin/catalogue?page=2');
  });

  it.each(['dashboard', 'defis', 'joueurs'])('envoie ?tab=%s vers l\'onglet de ce nom', async tab => {
    expect(await landOn(`/admin?tab=${tab}`)).toBe(`/admin/${tab}`);
  });

  it('l\'ancien onglet Actions mène aux Morceaux, où le cooldown se règle', async () => {
    expect(await landOn('/admin?tab=actions')).toBe('/admin/catalogue');
    expect(await landOn('/admin/actions')).toBe('/admin/catalogue');
  });

  it('garde les Thèmes et le sas À valider à leur adresse', async () => {
    expect(await landOn('/admin/themes?theme=3')).toBe('/admin/themes?theme=3');
    expect(await landOn('/admin/a-valider')).toBe('/admin/a-valider');
  });

  it('un onglet inconnu mène au tableau de bord', async () => {
    expect(await landOn('/admin?tab=nimporte-quoi')).toBe('/admin/dashboard');
    expect(await landOn('/admin/nimporte-quoi')).toBe('/admin/dashboard');
  });
});

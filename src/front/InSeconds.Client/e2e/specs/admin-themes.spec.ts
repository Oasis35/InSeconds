import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';
import { RunPage } from '../pages/run.page';
import { inSequence } from '../fixtures/sequence';
import type { Page } from '@playwright/test';

// L'onglet « Thèmes » de l'admin : la liste de thèmes (recherche, puces d'état), le détail (morceaux, retrait, ajout depuis le pool ou Deezer, écoute),
// puis l'icône de chaque thème (sélecteur Lucide). Les thèmes et leurs morceaux sont posés par l'API d'admin ; le seed donne 50 morceaux jouables.

interface CatalogueTrack { id: number; artist: string; title: string; previewStatus: string; isDisabled: boolean; themeIds: number[] }

/** Un thème de plus, avec ces morceaux (les premiers morceaux jouables du pool, à partir de `from`). */
async function createTheme(page: Page, name: string, count: number, from = 0): Promise<number> {
  const created = await page.request.post('/api/admin/catalogue/themes', { data: { name } });
  expect(created.ok(), `création de « ${name} »`).toBe(true);
  const { id } = (await created.json()) as { id: number };
  const tracks = (await listTracks(page)).filter(t => !t.isDisabled && t.previewStatus === 'available');
  for (const track of tracks.slice(from, from + count)) {
    const res = await page.request.put(`/api/admin/catalogue/tracks/${track.id}/themes`, { data: { themeIds: [id] } });
    expect(res.ok()).toBe(true);
  }
  return id;
}

async function listTracks(page: Page): Promise<CatalogueTrack[]> {
  return (await (await page.request.get('/api/admin/catalogue/tracks')).json()) as CatalogueTrack[];
}

async function listThemes(page: Page): Promise<{ id: number; name: string; trackCount: number; icon?: string | null }[]> {
  return (await (await page.request.get('/api/admin/catalogue/themes')).json()) as { id: number; name: string; trackCount: number; icon?: string | null }[];
}

async function openThemes(page: Page): Promise<AdminPage> {
  const admin = new AdminPage(page);
  await admin.goto();
  await admin.login();
  await admin.clickTab('Thèmes');
  await expect(page).toHaveURL(/\/admin\/themes/);
  return admin;
}

const card = (page: Page, name: string) => page.getByTestId('theme-card').filter({ hasText: name });

test.describe('Admin - thèmes', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('liste les thèmes avec leur état, se filtre par puce et par recherche', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await createTheme(page, 'Années 80', 3);
    await createTheme(page, 'Rock', 7, 3);
    await createTheme(page, 'Pop', 14, 10);
    await admin.clickTab('Thèmes');

    await expect(page.getByTestId('theme-card')).toHaveCount(3);
    await expect(card(page, 'Années 80')).toContainText('Pas jouable');
    await expect(card(page, 'Rock')).toContainText('Peu varié');
    await expect(card(page, 'Pop')).toContainText('Varié');
    await expect(card(page, 'Pop')).toContainText('14 morceaux · 14 jouables');

    await page.getByTestId('theme-chip').filter({ hasText: 'Pas jouables' }).click();
    await expect(page.getByTestId('theme-card')).toHaveCount(1);
    await expect(card(page, 'Années 80')).toBeVisible();

    await page.getByTestId('theme-chip').filter({ hasText: 'Tous' }).click();
    await page.getByTestId('theme-search').fill('POP');
    await expect(page.getByTestId('theme-card')).toHaveCount(1);
    await expect(card(page, 'Pop')).toBeVisible();
  });

  test('crée un thème depuis l\'onglet : le détail s\'ouvre avec l\'avertissement', async ({ page }) => {
    await openThemes(page);

    await page.getByTestId('theme-new').fill('Chansons de Noël');
    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByTestId('theme-panel')).toContainText('Chansons de Noël');
    await expect(page.getByTestId('theme-warning')).toHaveText('Il manque 7 morceaux jouables.');
    await expect(page.getByTestId('theme-tracks-empty')).toBeVisible();
    expect((await listThemes(page)).map(t => t.name)).toContain('Chansons de Noël');
  });

  test('l\'avertissement compte les morceaux jouables seulement, et disparaît à 7', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await createTheme(page, 'Presque', 6);
    await createTheme(page, 'Assez', 7, 6);
    await admin.clickTab('Thèmes');

    await card(page, 'Presque').click();
    await expect(page.getByTestId('theme-warning')).toHaveText('Il manque 1 morceaux jouables.');

    await card(page, 'Assez').click();
    await expect(page.getByTestId('theme-panel')).toContainText('Assez');
    await expect(page.getByTestId('theme-warning')).toHaveCount(0);
  });

  test('retirer un morceau du thème le garde dans le pool', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const id = await createTheme(page, 'Années 80', 3);
    await admin.clickTab('Thèmes');
    await card(page, 'Années 80').click();
    await expect(page.getByTestId('theme-track')).toHaveCount(3);
    const first = await page.getByTestId('theme-track').first().locator('span.truncate').first().innerText();

    await page.getByTestId('theme-track-remove').first().click();

    await expect(page.getByTestId('theme-track')).toHaveCount(2);
    const tracks = await listTracks(page);
    const removed = tracks.find(t => t.title === first)!;
    expect(removed).toBeDefined();
    expect(removed.themeIds).not.toContain(id);
    expect(tracks.filter(t => t.themeIds.includes(id))).toHaveLength(2);
  });

  test('cherche parmi les morceaux du thème', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await createTheme(page, 'Années 2000', 8);
    await admin.clickTab('Thèmes');
    await card(page, 'Années 2000').click();
    // Les morceaux arrivent après l'ouverture du détail : on attend la liste au lieu de la compter tout de suite.
    await expect(page.getByTestId('theme-track')).toHaveCount(8);
    const title = await page.getByTestId('theme-track').first().locator('span.truncate').first().innerText();

    await page.getByTestId('theme-track-search').fill(title);

    await expect(page.getByTestId('theme-track')).toHaveCount(1);
  });

  test('pagine les morceaux du thème par 10, la page vit dans l\'adresse', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const id = await createTheme(page, 'Années 90', 12);
    await admin.clickTab('Thèmes');
    await card(page, 'Années 90').click();
    await expect(page.getByTestId('theme-track')).toHaveCount(10);
    await expect(page).toHaveURL(new RegExp(`theme=${id}(&|$)`));

    await page.getByTestId('theme-page-next').click();

    await expect(page.getByTestId('theme-track')).toHaveCount(2);
    await expect(page).toHaveURL(new RegExp(`theme=${id}&page=2$`));
    await page.reload();
    await expect(page.getByTestId('theme-track')).toHaveCount(2);

    await page.getByTestId('theme-page-prev').click();
    await expect(page.getByTestId('theme-track')).toHaveCount(10);
    await expect(page).not.toHaveURL(/page=/);
  });

  test('ajoute des morceaux du pool au thème', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const id = await createTheme(page, 'Hip-hop', 0);
    await admin.clickTab('Thèmes');
    await card(page, 'Hip-hop').click();

    await page.getByTestId('theme-add-open').click();
    await page.getByTestId('theme-pool-search').fill('Kendrick');
    await expect(page.getByTestId('theme-candidate')).toHaveCount(2);
    await page.getByTestId('theme-candidate').getByRole('checkbox').first().check();
    await page.getByTestId('theme-candidate').getByRole('checkbox').nth(1).check();
    await page.getByTestId('theme-add-submit').click();

    // Le panneau se referme sur le détail, avec les deux morceaux.
    await expect(page.getByTestId('theme-add-open')).toBeVisible();
    await expect(page.getByTestId('theme-track')).toHaveCount(2);
    expect((await listTracks(page)).filter(t => t.themeIds.includes(id)).map(t => t.artist)).toEqual(['Kendrick Lamar', 'Kendrick Lamar']);
  });

  test('ajoute un morceau de Deezer au pool et au thème d\'un seul geste', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const id = await createTheme(page, 'Nouveautés', 0);
    await admin.clickTab('Thèmes');
    await card(page, 'Nouveautés').click();
    await page.getByTestId('theme-add-open').click();
    await page.getByTestId('theme-add-source').filter({ hasText: 'Sur Deezer' }).click();

    await page.getByTestId('theme-deezer-search').fill('E2E Track');
    await expect(page.getByTestId('theme-deezer-result')).toHaveCount(1, { timeout: 10000 });
    await page.getByTestId('theme-deezer-result').getByRole('button', { name: 'Ajouter au pool et au thème' }).click();

    await expect(page.getByTestId('theme-deezer-result')).toContainText('Déjà dans ce thème');
    const added = (await listTracks(page)).find(t => t.artist === 'E2E Artist');
    expect(added, 'le morceau est dans le pool').toBeDefined();
    expect(added!.themeIds).toContain(id);
  });

  test('le ▶ d\'un morceau du thème ouvre la fenêtre d\'écoute', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await createTheme(page, 'Années 80', 2);
    await admin.clickTab('Thèmes');
    await card(page, 'Années 80').click();

    await page.getByTestId('theme-track').first().getByRole('button', { name: /écouter/i }).click();

    await expect(page.getByTestId('preview-toggle')).toBeVisible();
  });

  test('le thème ouvert est dans l\'adresse et se rouvre au rechargement', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const id = await createTheme(page, 'Années 80', 2);
    await createTheme(page, 'Films', 2, 2);
    await admin.clickTab('Thèmes');

    await card(page, 'Films').click();
    await expect(page).toHaveURL(/\/admin\/themes\?theme=\d+/);
    await page.reload();

    await expect(page.getByTestId('theme-panel')).toContainText('Films');
    expect(id).toBeGreaterThan(0);
  });

  test('renomme un thème, et supprime un thème vide seulement', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await createTheme(page, 'Plein', 2);
    await createTheme(page, 'Vide', 0);
    await admin.clickTab('Thèmes');

    await card(page, 'Vide').click();
    await page.getByTestId('theme-rename').click();
    await page.getByTestId('theme-name-input').fill('Vide renommé');
    await page.getByTestId('theme-name-input').press('Enter');
    await expect(page.getByTestId('theme-panel')).toContainText('Vide renommé');

    await page.getByTestId('theme-delete').click();
    await expect(page.getByTestId('theme-card').filter({ hasText: 'Vide renommé' })).toHaveCount(0);

    await card(page, 'Plein').click();
    await expect(page.getByTestId('theme-delete')).toBeDisabled();
  });
});

test.describe('Admin - icônes des thèmes', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('choisit une icône : elle s\'affiche dans le détail et la liste, et reste après rechargement', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const id = await createTheme(page, 'Rock', 2);
    await admin.clickTab('Thèmes');
    await card(page, 'Rock').click();
    await expect(page.locator('h2 svg')).toHaveCount(0);

    await page.getByTestId('theme-icon-open').click();
    await page.getByTestId('theme-icon-search').fill('guitare');
    await page.getByTestId('theme-icon-option').filter({ has: page.locator('svg') }).first().waitFor();
    await page.getByRole('button', { name: 'guitar', exact: true }).click();
    await page.getByTestId('theme-icon-save').click();

    // Retour au détail, avec l'icône à côté du nom.
    await expect(page.getByTestId('theme-icon-picker')).toHaveCount(0);
    await expect(page.locator('h2 svg')).toHaveCount(1);
    expect((await listThemes(page)).find(t => t.id === id)?.icon).toBe('guitar');

    await page.reload();
    await expect(page.locator('h2 svg')).toHaveCount(1);
    await expect(card(page, 'Rock').locator('svg')).toHaveCount(1);
  });

  test('« Sans icône » retire l\'icône', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const id = await createTheme(page, 'Rock', 2);
    expect((await page.request.put(`/api/admin/catalogue/themes/${id}/icon`, { data: { icon: 'guitar' } })).status()).toBe(204);
    await admin.clickTab('Thèmes');
    await card(page, 'Rock').click();
    await expect(page.locator('h2 svg')).toHaveCount(1);

    await page.getByTestId('theme-icon-open').click();
    await expect(page.getByRole('button', { name: 'guitar', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('theme-icon-clear').click();

    await expect(page.locator('h2 svg')).toHaveCount(0);
    await expect(card(page, 'Rock').locator('svg')).toHaveCount(0);
    expect((await listThemes(page)).find(t => t.id === id)?.icon ?? null).toBeNull();
  });

  test('le sélecteur filtre par catégorie et par recherche, et dit quand rien ne correspond', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await createTheme(page, 'Rock', 2);
    await admin.clickTab('Thèmes');
    await card(page, 'Rock').click();
    await page.getByTestId('theme-icon-open').click();
    const options = page.getByTestId('theme-icon-option');
    // Le sélecteur se dessine après le clic : on attend la grille avant de la compter.
    await expect.poll(() => options.count()).toBeGreaterThan(100);
    const total = await options.count();

    await page.getByTestId('theme-icon-category').filter({ hasText: 'Animaux' }).click();
    // Le filtre s'applique au rendu suivant : on attend le nouveau compte au lieu de le lire tout de suite.
    await expect.poll(() => options.count()).toBeLessThan(total);
    expect(await options.count()).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'cat', exact: true })).toBeVisible();

    await page.getByTestId('theme-icon-search').fill('zzzzzz');
    await expect(page.getByTestId('theme-icon-empty')).toBeVisible();
    await expect(options).toHaveCount(0);
  });

  test('« Choisir » n\'est actif qu\'une fois une autre icône touchée, « Fermer » ne change rien', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const id = await createTheme(page, 'Rock', 2);
    await admin.clickTab('Thèmes');
    await card(page, 'Rock').click();
    await page.getByTestId('theme-icon-open').click();
    await expect(page.getByTestId('theme-icon-save')).toBeDisabled();

    await page.getByRole('button', { name: 'music', exact: true }).first().click();
    await expect(page.getByTestId('theme-icon-save')).toBeEnabled();
    await page.getByTestId('theme-icon-close').click();

    await expect(page.getByTestId('theme-icon-picker')).toHaveCount(0);
    expect((await listThemes(page)).find(t => t.id === id)?.icon ?? null).toBeNull();
  });

  test('l\'API refuse un nom d\'icône invalide et un thème inconnu', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const id = await createTheme(page, 'Rock', 0);

    expect((await page.request.put(`/api/admin/catalogue/themes/${id}/icon`, { data: { icon: 'Pas Valide!' } })).status()).toBe(400);
    expect((await page.request.put('/api/admin/catalogue/themes/999999/icon', { data: { icon: 'guitar' } })).status()).toBe(404);
  });

  test('l\'icône du thème s\'affiche dans le choix de thème d\'une playlist de Setlist', async ({ page, api }) => {
    test.slow();
    // Sans réserve et avec de grands thèmes : assez de morceaux restent à chaque thème une fois ceux de la playlist écartés.
    await api.setRunSetting('Runs:ReservePerRound', '0');
    const run = new RunPage(page);
    await run.loginAsAdmin();
    const eighties = await createTheme(page, 'Années 80', 16);
    const movies = await createTheme(page, 'Films', 16, 16);
    await createTheme(page, 'Rap', 16, 32);
    expect((await page.request.put(`/api/admin/catalogue/themes/${eighties}/icon`, { data: { icon: 'music' } })).status()).toBe(204);
    expect((await page.request.put(`/api/admin/catalogue/themes/${movies}/icon`, { data: { icon: 'clapperboard' } })).status()).toBe(204);

    await run.launch();
    const tracks = await api.latestRunTracks();
    // Le tirage de la manche à thème est aléatoire : on la place à la manche 2, et le choix arrive après la manche 1.
    await api.forceThemedRound(2);
    await inSequence(tracks.filter(t => t.round === 1), track => run.answerRight(track));

    await expect(page.getByTestId('run-theme')).toBeVisible();
    const tiles = page.locator('[data-theme-id]:not([data-theme-id="mystery"])');
    await expect(tiles).toHaveCount(2);
    // Une icône pour les thèmes qui en ont une, aucune pour la ligne « Thème mystère ».
    await expect(page.locator('[data-theme-id="mystery"] svg')).toHaveCount(0);
    await expect(page.locator('[data-theme-id] svg')).not.toHaveCount(0);
  });

  test('importe un classement après un aperçu, sans rien retirer, et exporte le pool', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const rock = await createTheme(page, 'Rock', 1, 0);
    await createTheme(page, 'Jazz', 0);
    const tracks = (await listTracks(page)).filter(t => !t.isDisabled && t.previewStatus === 'available');
    const [already, one, two] = [tracks[0], tracks[1], tracks[2]];
    await admin.clickTab('Thèmes');

    await page.getByTestId('themes-import').click();
    await page.getByTestId('import-text').fill(`Rock ; ${already.id}\nrock ; ${one.id}\nJazz ; ${two.id}\nFilms ; ${one.id}\nJazz ; 99999`);
    await page.getByTestId('import-preview').click();

    await expect(page.getByTestId('import-group')).toHaveCount(3);
    await expect(page.getByTestId('import-unknown-theme')).toBeVisible();
    await expect(page.getByTestId('import-problems')).toBeVisible();
    // Un morceau décoché n'est pas ajouté.
    await page.getByTestId('import-track').filter({ hasText: two.title }).getByRole('checkbox').uncheck();
    await expect(page.getByTestId('import-apply')).toBeEnabled();
    await page.getByTestId('import-apply').click();

    await expect(page.getByTestId('import-result')).toBeVisible();
    const after = await listTracks(page);
    expect(after.find(t => t.id === one.id)?.themeIds).toContain(rock);
    expect(after.find(t => t.id === already.id)?.themeIds).toEqual([rock]);
    expect(after.find(t => t.id === two.id)?.themeIds).toEqual([]);

    await page.getByTestId('import-close').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('themes-export').click();
    expect((await download).suggestedFilename()).toMatch(/^inseconds-pool-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/);
  });

  test('ajoute en lot les morceaux d\'un filtre d\'années ou de genre', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const theme = await createTheme(page, 'Tout', 0);
    await admin.clickTab('Thèmes');

    await card(page, 'Tout').click();
    await page.getByTestId('theme-add-open').click();
    await page.getByTestId('theme-pick-all').click();
    await page.getByTestId('theme-add-submit').click();

    await expect(page.getByTestId('theme-add-submit')).toHaveCount(0);
    const inTheme = (await listTracks(page)).filter(t => t.themeIds.includes(theme));
    expect(inTheme.length).toBeGreaterThan(1);
  });
});

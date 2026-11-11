import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';
import { RunPage } from '../pages/run.page';
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
    const all = await page.getByTestId('theme-track').count();
    const title = await page.getByTestId('theme-track').first().locator('span.truncate').first().innerText();

    await page.getByTestId('theme-track-search').fill(title);

    await expect(page.getByTestId('theme-track')).toHaveCount(1);
    expect(all).toBe(8);
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
    const total = await options.count();
    expect(total).toBeGreaterThan(100);

    await page.getByTestId('theme-icon-category').filter({ hasText: 'Animaux' }).click();
    const animals = await options.count();
    expect(animals).toBeGreaterThan(0);
    expect(animals).toBeLessThan(total);
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

  test('l\'icône du thème s\'affiche dans le choix de thème d\'une playlist de Platines', async ({ page }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    const eighties = await createTheme(page, 'Années 80', 8);
    const movies = await createTheme(page, 'Films', 8, 8);
    expect((await page.request.put(`/api/admin/catalogue/themes/${eighties}/icon`, { data: { icon: 'music' } })).status()).toBe(204);
    expect((await page.request.put(`/api/admin/catalogue/themes/${movies}/icon`, { data: { icon: 'clapperboard' } })).status()).toBe(204);

    await run.open();
    await run.startButton.click();

    await expect(page.getByTestId('run-theme')).toBeVisible();
    const tiles = page.locator('[data-theme-id]:not([data-theme-id="surprise"])');
    await expect(tiles).toHaveCount(2);
    await expect(tiles.first().locator('svg')).toHaveCount(1);
    await expect(tiles.nth(1).locator('svg')).toHaveCount(1);
    await expect(page.locator('[data-theme-id="surprise"] svg')).toHaveCount(0);
  });
});

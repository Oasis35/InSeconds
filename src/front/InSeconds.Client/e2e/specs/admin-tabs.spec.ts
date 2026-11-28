import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';

test.describe('Admin - chargement paresseux par onglet', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('ne charge les données d\'un onglet qu\'à son ouverture', async ({ page }) => {
    const admin = new AdminPage(page);
    const adminCalls: string[] = [];
    page.on('request', req => {
      const u = req.url();
      if (u.includes('/api/admin/')) adminCalls.push(u);
    });

    await admin.goto();
    await admin.login();

    // Accueil = onglet d'atterrissage → ses stats et celles des défis (joueurs et morceaux du jour) se chargent...
    await expect.poll(() => adminCalls.some(u => u.includes('/api/admin/daily/dashboard'))).toBe(true);
    await expect.poll(() => adminCalls.some(u => u.includes('/api/admin/daily/challenges/stats'))).toBe(true);
    // ...mais pas les morceaux, ni la liste des joueurs
    expect(adminCalls.some(u => u.endsWith('/api/admin/catalogue/tracks'))).toBe(false);
    expect(adminCalls.some(u => u.endsWith('/api/admin/players'))).toBe(false);

    // Ouvrir Morceaux → GET /api/admin/catalogue/tracks
    await admin.clickTab('Morceaux');
    await expect.poll(() => adminCalls.some(u => u.endsWith('/api/admin/catalogue/tracks'))).toBe(true);
    expect(adminCalls.some(u => u.endsWith('/api/admin/players'))).toBe(false);
  });

  test('le compteur d\'un onglet n\'apparaît qu\'une fois ses données lues', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();

    // Avant visite : libellé nu (pas de "(N)")
    await expect(admin.tab('Joueurs')).toBeVisible();

    await admin.clickTab('Joueurs');
    await expect(page.getByRole('link', { name: /^Joueurs \(\d+\)$/ })).toBeVisible();
  });

  test('l\'onglet et la page de la grille des morceaux survivent au rechargement', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();

    await admin.clickTab('Morceaux');
    await expect(page).toHaveURL(/\/admin\/catalogue$/);
    await expect(page.getByText(/page 1\/\d+/)).toBeVisible();

    await page.getByRole('button', { name: '→' }).click();
    await expect(page).toHaveURL(/\/admin\/catalogue\?page=2$/);

    await page.reload();
    await expect(page.getByText(/page 2\/\d+/)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/catalogue\?page=2$/);
  });

  test('une ancienne adresse /admin?tab=pool ouvre l\'onglet Morceaux', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();

    await page.goto('/admin?tab=pool');
    await expect(page).toHaveURL(/\/admin\/catalogue$/);
    await expect(page.getByRole('link', { name: 'Contenu', exact: true })).toHaveAttribute('aria-current', 'page');
  });
});

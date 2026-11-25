import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';

/** Le témoin du bouton « Admin » de l'en-tête : un point et un nom accessible qui disent l'état technique, lus à l'arrivée pour un admin seulement. */
test.describe('Admin - témoin de l\'en-tête', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  /** Les lectures de l'état technique que fait le témoin (les mêmes que le panneau de l'admin). */
  const isStatusRead = (url: string) => url.includes('/api/admin/system') || url.includes('/api/admin/jobs/last-runs');

  test("un admin voit le point sur l'accueil, avec un nom accessible qui dit l'état", async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();

    await page.goto('/');

    await expect(page.getByTestId('header-admin-dot')).toBeVisible();
    await expect(page.getByTestId('header-admin')).toHaveAttribute('aria-label', /^Admin, (tout va bien|\d+ alerte\(s\))$/);
  });

  test("lit l'état une seule fois en passant d'une page à l'autre, sans le relire", async ({ page }) => {
    const reads: string[] = [];
    page.on('request', req => {
      if (isStatusRead(req.url())) reads.push(req.url());
    });
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    // Dans l'admin, la coquille lit l'état ; le témoin n'ajoute rien.
    await expect.poll(() => reads.length).toBeGreaterThan(0);
    const inAdmin = reads.length;

    await page.goto('/');
    await expect(page.getByTestId('header-admin-dot')).toBeVisible();
    const onHome = reads.length;
    expect(onHome).toBeGreaterThan(inAdmin);

    // Changer de page (l'historique, puis le classement) ne relit rien : la période de lecture n'est pas passée.
    await page.getByTestId('tab-history').click();
    await expect(page).toHaveURL(/\/history/);
    await page.getByTestId('tab-ranking').click();
    await expect(page).toHaveURL(/\/ranking/);
    await expect(page.getByTestId('header-admin-dot')).toBeVisible();

    expect(reads).toHaveLength(onHome);
  });

  test("un joueur qui n'est pas admin ne lit rien de l'admin et n'a pas de point", async ({ page }) => {
    const adminCalls: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/admin/')) adminCalls.push(req.url());
    });

    await page.goto('/');
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByTestId('tab-account')).toBeVisible();

    await expect(page.getByTestId('header-admin')).toHaveCount(0);
    await expect(page.getByTestId('header-admin-dot')).toHaveCount(0);
    expect(adminCalls).toEqual([]);
  });
});

import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

test.describe('Ligne légale - mentions légales et confidentialité', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('le lien confidentialité ouvre /privacy, qui renvoie aux mentions légales', async ({ page }) => {
    const game = new GamePage(page);

    await game.goto();
    await game.waitForWelcome();

    await page.getByTestId('home-legal-line').getByRole('link', { name: 'Confidentialité', exact: true }).click();

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Confidentialité', exact: true })).toBeVisible();
    await expect(page.getByText('Éditeur et hébergement')).toHaveCount(0);

    await page.getByRole('link', { name: 'Voir les mentions légales' }).click();
    await expect(page).toHaveURL(/\/legal$/);
  });

  test('le lien mentions légales ouvre /legal (éditeur, hébergeur, contenus musicaux)', async ({ page }) => {
    const game = new GamePage(page);

    await game.goto();
    await game.waitForWelcome();

    await page.getByTestId('home-legal-line').getByRole('link', { name: 'Mentions légales', exact: true }).click();

    await expect(page).toHaveURL(/\/legal$/);
    await expect(page.getByRole('heading', { name: 'Mentions légales', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Éditeur et hébergement' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Contenus musicaux (API Deezer)' })).toBeVisible();
  });

  test("l'alias /confidentialite redirige vers /privacy", async ({ page }) => {
    await page.goto('/confidentialite');

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Confidentialité', exact: true })).toBeVisible();
  });

  for (const alias of ['/mentions-legales', '/legal-notice']) {
    test(`l'alias ${alias} redirige vers /legal`, async ({ page }) => {
      await page.goto(alias);

      await expect(page).toHaveURL(/\/legal$/);
      await expect(page.getByRole('heading', { name: 'Mentions légales', exact: true })).toBeVisible();
    });
  }
});

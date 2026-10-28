import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

test.describe('Footer - langue, mentions légales et confidentialité', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('le bouton langue bascule FR → EN puis EN → FR', async ({ page }) => {
    const game = new GamePage(page);

    await game.goto();
    await game.waitForWelcome();

    // Le fixture force lang=fr : FR est en avant et le tooltip vise l'anglais
    const language = page.getByTestId('footer-language');
    await expect(language).toHaveAttribute('title', 'Switch to English');
    await expect(language.locator('.font-semibold')).toHaveText('FR');

    await language.click();

    // L'UI passe en anglais immédiatement
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(language).toHaveAttribute('title', 'Passer en français');
    await expect(language.locator('.font-semibold')).toHaveText('EN');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    // Persisté en localStorage (la persistance au rechargement est couverte en TU ;
    // pas testable ici car le fixture E2E ré-force lang=fr à chaque navigation)
    expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');

    // Toggle inverse EN → FR
    await language.click();
    await expect(page.getByRole('button', { name: 'Commencer' })).toBeVisible();
  });

  test('le lien confidentialité ouvre /privacy, qui renvoie aux mentions légales', async ({ page }) => {
    const game = new GamePage(page);

    await game.goto();
    await game.waitForWelcome();

    await page.locator('footer').getByRole('link', { name: 'Confidentialité', exact: true }).click();

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

    await page.locator('footer').getByRole('link', { name: 'Mentions légales', exact: true }).click();

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

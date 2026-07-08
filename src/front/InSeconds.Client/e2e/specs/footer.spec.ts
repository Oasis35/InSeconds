import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

test.describe('Footer — langue et confidentialité', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('le bouton langue bascule FR → EN puis EN → FR', async ({ page }) => {
    const game = new GamePage(page);

    await game.goto();
    await game.waitForWelcome();

    // Le fixture force lang=fr : le bouton affiche FR et son tooltip vise l'anglais
    // (le code langue est en minuscules dans le DOM, la majuscule vient du CSS `uppercase`)
    const langButtonFr = page.getByTitle('Switch to English');
    await expect(langButtonFr).toHaveText(/fr/i);

    await langButtonFr.click();

    // L'UI passe en anglais immédiatement
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.getByTitle('Passer en français')).toHaveText(/en/i);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    // Persisté en localStorage (la persistance au rechargement est couverte en TU ;
    // pas testable ici car le fixture E2E ré-force lang=fr à chaque navigation)
    expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');

    // Toggle inverse EN → FR
    await page.getByTitle('Passer en français').click();
    await expect(page.getByRole('button', { name: 'Commencer' })).toBeVisible();
  });

  test('le lien confidentialité ouvre la page /privacy', async ({ page }) => {
    const game = new GamePage(page);

    await game.goto();
    await game.waitForWelcome();

    await page.getByTitle('Confidentialité').click();

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole('heading', { name: 'Politique de confidentialité' })
    ).toBeVisible();
  });

  test("l'alias /confidentialite redirige vers /privacy", async ({ page }) => {
    await page.goto('/confidentialite');

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole('heading', { name: 'Politique de confidentialité' })
    ).toBeVisible();
  });
});

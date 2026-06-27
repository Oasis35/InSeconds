import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

test.describe('Confirmation de sortie en cours de partie (guard CanDeactivate)', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('annuler la sortie garde le joueur sur la partie', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    await expect(page.getByText('Piste 1 / 3')).toBeVisible();

    // Tenter de quitter via le lien Admin du footer
    await page.getByTitle('Admin').click();

    // La modale de confirmation s'affiche
    await expect(game.leaveConfirmButton).toBeVisible();
    await expect(game.leaveCancelButton).toBeVisible();

    // « Continuer à jouer » → on reste sur la partie, l'URL n'a pas changé
    await game.leaveCancelButton.click();
    await expect(game.leaveConfirmButton).not.toBeVisible();
    await expect(page.getByText('Piste 1 / 3')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('confirmer la sortie navigue hors de la partie', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    await expect(page.getByText('Piste 1 / 3')).toBeVisible();

    await page.getByTitle('Admin').click();
    await expect(game.leaveConfirmButton).toBeVisible();

    // « Quitter quand même » → navigation vers /admin
    await game.leaveConfirmButton.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/admin');
  });

  test('aucune confirmation si la partie n\'est pas commencée', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    // Sur l'écran welcome (pas playing) le guard laisse passer directement
    await page.getByTitle('Admin').click();
    await expect(game.leaveConfirmButton).not.toBeVisible();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/admin');
  });
});

import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

test.describe('Confirmation de sortie en cours de partie (guard CanDeactivate)', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('annuler la sortie garde le joueur sur la partie', async ({ page }) => {
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await expect(page.getByText('Piste 1 / 5')).toBeVisible();

    // Tenter de quitter via un lien interne du footer (icône Confidentialité — l'icône Admin
    // n'est visible que pour un compte IsAdmin=true, cf. game-footer.component.html)
    await page.getByTitle(/Confidentialité/).click();

    // La modale de confirmation s'affiche
    await expect(game.leaveConfirmButton).toBeVisible();
    await expect(game.leaveCancelButton).toBeVisible();

    // « Continuer à jouer » → on reste sur la partie, l'URL n'a pas changé
    await game.leaveCancelButton.click();
    await expect(game.leaveConfirmButton).not.toBeVisible();
    await expect(page.getByText('Piste 1 / 5')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('confirmer la sortie navigue hors de la partie', async ({ page }) => {
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await expect(page.getByText('Piste 1 / 5')).toBeVisible();

    await page.getByTitle(/Confidentialité/).click();
    await expect(game.leaveConfirmButton).toBeVisible();

    // « Quitter quand même » → navigation vers /privacy
    await game.leaveConfirmButton.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/privacy');
  });

  test('aucune confirmation si la partie n\'est pas commencée', async ({ page }) => {
    const game = new GamePage(page);
    await game.openWithFakeClock();

    // Sur l'écran welcome (pas playing) le guard laisse passer directement
    await page.getByTitle(/Confidentialité/).click();
    await expect(game.leaveConfirmButton).not.toBeVisible();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/privacy');
  });
});

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

    // Tenter de quitter par le retour du navigateur (aucun lien en manche : ni barre, ni ligne légale)
    await page.goBack();

    // La modale de confirmation s'affiche
    await expect(game.leaveConfirmButton).toBeVisible();
    await expect(game.leaveCancelButton).toBeVisible();

    // « Continuer à jouer » → on reste sur la partie, l'URL n'a pas changé
    await game.leaveCancelButton.click();
    await expect(game.leaveConfirmButton).not.toBeVisible();
    await expect(page.getByText('Piste 1 / 5')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/daily');
  });

  test('confirmer la sortie ferme la confirmation', async ({ page }) => {
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await expect(page.getByText('Piste 1 / 5')).toBeVisible();

    await page.goBack();
    await expect(game.leaveConfirmButton).toBeVisible();

    // « Quitter quand même » ferme la confirmation
    await game.leaveConfirmButton.click();
    await expect(game.leaveConfirmButton).not.toBeVisible();
  });

  test('aucune confirmation si la partie n\'est pas commencée', async ({ page }) => {
    const game = new GamePage(page);
    await game.openWithFakeClock();

    // Sur l'écran welcome (pas playing) le guard laisse passer directement
    await page.getByTestId('home-legal-line').getByRole('link', { name: 'Confidentialité', exact: true }).click();
    await expect(game.leaveConfirmButton).not.toBeVisible();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/privacy');
  });
});

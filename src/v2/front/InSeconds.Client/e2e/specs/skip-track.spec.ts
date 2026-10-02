import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Bouton « Passer (0 pts) » sous Valider : confirmation inline obligatoire (même encart que
// la réponse vide), puis réponse vide envoyée au palier écouté → 0 point.
test.describe('Passer un morceau', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('annuler referme la confirmation, confirmer passe le morceau à 0 pt', async ({ page }) => {
    const round = new BlindRoundPage(page);
    await new GamePage(page).startFirstRound(round, 0.5);

    const skipButton = page.getByRole('button', { name: 'Passer (0 pts)' });
    const confirmText = page.getByText('Passer ce morceau ? Tu marqueras 0 points');

    await skipButton.click();
    await expect(confirmText).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(confirmText).not.toBeVisible();
    await expect(round.submitButton).toBeVisible();

    await skipButton.click();
    await page.getByRole('button', { name: 'Passer', exact: true }).click();

    expect(await round.readRoundScore()).toBe(0);
  });
});

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
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    await round.chooseDuration(0.5);
    await round.waitForAnswerInput();

    const skipButton = page.getByRole('button', { name: 'Passer (0 pts)' });
    const confirmText = page.getByText('Passer ce morceau ? Tu marqueras 0 points');

    await skipButton.click();
    await expect(confirmText).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(confirmText).not.toBeVisible();
    await expect(round.submitButton).toBeVisible();

    await skipButton.click();
    await page.getByRole('button', { name: 'Passer', exact: true }).click();

    await round.nextButton.waitFor({ state: 'visible' });
    const scoreText = await round.roundScore.textContent();
    expect(parseInt(scoreText?.replace(/\D/g, '') ?? '', 10)).toBe(0);
  });
});

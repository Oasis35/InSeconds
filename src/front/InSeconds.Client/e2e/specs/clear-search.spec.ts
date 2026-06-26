import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Bouton ✕ — effacement de la saisie', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('le bouton ✕ vide le champ et disparaît', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    // Lancer un palier pour faire apparaître le champ de saisie
    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();

    // Champ vide → pas de bouton ✕
    await expect(round.clearSearchButton).not.toBeVisible();

    // Saisir du texte → le bouton ✕ apparaît
    await round.answerInput.fill('Daft Punk - Get Lucky');
    await expect(round.clearSearchButton).toBeVisible();

    // Cliquer ✕ → champ vidé et bouton masqué
    await round.clearSearchButton.click();
    await expect(round.answerInput).toHaveValue('');
    await expect(round.clearSearchButton).not.toBeVisible();
  });
});

import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Happy path — partie complète', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('joue 3 morceaux et voit le score final', async ({ page, api }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    // 3 morceaux — réponses vides (confirme quand même) pour aller vite
    for (let i = 0; i < 3; i++) {
      await round.playRound(1);
    }

    await game.waitForDone();
    await expect(game.finalScoreLabel).toBeVisible();
    await expect(page.getByText('Reviens demain pour un nouveau défi')).toBeVisible();
  });

  test('affiche la progression piste X / 3 pendant la partie', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await expect(page.getByText('Piste 1 / 3')).toBeVisible();

    await round.playRound(1);
    await expect(page.getByText('Piste 2 / 3')).toBeVisible();
  });
});

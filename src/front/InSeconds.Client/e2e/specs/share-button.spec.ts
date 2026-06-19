import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Bouton partager', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('copie le score dans le presse-papier après la partie', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    for (let i = 0; i < 3; i++) {
      await round.playRound(1);
    }

    await game.waitForDone();
    await game.shareButton.click();

    // Le bouton passe en "✓ Copié !"
    await expect(game.shareCopiedButton).toBeVisible();

    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipText).toContain('InSeconds 🎵');
    expect(clipText).toContain('pts');
    expect(clipText).toContain('/blindtest');
  });
});

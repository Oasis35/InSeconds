import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Déjà joué — écran 409', () => {
  test('affiche le countdown et le score après avoir rejoué', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    // Jouer une partie complète
    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    for (let i = 0; i < 3; i++) {
      await round.playRound(1);
    }
    await game.waitForDone();

    // Recharger la page — le même cookie est renvoyé → 409
    await game.goto();

    await expect(game.alreadyPlayedHeading).toBeVisible();
    await expect(game.countdown).toBeVisible();
    // Le score du joueur est affiché
    await expect(page.getByText('Ton score')).toBeVisible();
  });
});

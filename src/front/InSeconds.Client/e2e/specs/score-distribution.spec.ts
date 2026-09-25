import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Égaliseur « répartition des scores du jour » (score final + déjà joué).
// Réponses vides partout → tous les scores valent 0.
test.describe('Répartition des scores du jour', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('score final : égaliseur affiché, sans la phrase en % quand on joue seul', async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    const chart = page.getByTestId('score-distribution-chart');
    await expect(chart).toBeVisible();
    await expect(chart.getByTestId('score-lowest')).toHaveText('0');
    await expect(chart.getByTestId('score-median')).toHaveText('0');
    await expect(chart.getByTestId('score-highest')).toHaveText('0');
    await expect(page.getByTestId('score-better-than')).toHaveCount(0);
  });

  test('déjà joué : plus de case Médiane, phrase en % affichée à partir de 5 joueurs', async ({ page, api }) => {
    for (let i = 0; i < 4; i++) {
      await api.completeSessionAsNewGuest();
    }

    await page.clock.install({ time: Date.now() });
    const game = new GamePage(page);
    await game.completeGameThenReload(new BlindRoundPage(page));

    await expect(game.alreadyPlayedHeading).toBeVisible();
    await expect(page.getByText('Médiane', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('score-distribution-chart')).toBeVisible();
    // 5 joueurs à 0 pt : personne n'est strictement en dessous.
    await expect(page.getByTestId('score-better-than')).toHaveText(/Tu fais mieux que\s+0 %\s+des joueurs/);
  });
});

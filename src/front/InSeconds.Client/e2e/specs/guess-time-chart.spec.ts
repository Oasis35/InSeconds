import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Paliers par défaut (AppSettings.AllowedDurationsSeconds) + 1 barre « ✗ ».
const EXPECTED_BARS = 7 + 1;

test.describe('Histogramme « en combien de temps les autres ont trouvé »', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('bonne réponse : 8 barres, colonne du palier écouté en surbrillance', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await round.chooseDuration(1);
    await round.waitForAnswerInput();
    await round.typeAnswer('Eminem - Lose Yourself');
    await round.submit();
    await round.nextButton.waitFor({ state: 'visible' });

    await expect(round.guessTimeChart).toBeVisible();
    await expect(round.guessTimeBars).toHaveCount(EXPECTED_BARS);
    await expect(round.guessTimeHighlighted).toHaveCount(1);
    await expect(round.guessTimeHighlighted).toHaveAttribute('data-bucket', 'd1');

    // L'ancienne ligne texte a disparu.
    await expect(page.getByText('Pas trouvé :')).toHaveCount(0);
    await expect(page.getByText('Ton temps :')).toHaveCount(0);
  });

  test('mauvaise réponse : la barre « ✗ » est en surbrillance', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await round.chooseDuration(1);
    await round.waitForAnswerInput();
    await round.typeAnswer('zzz réponse invalide zzz');
    await round.submit();
    await round.nextButton.waitFor({ state: 'visible' });

    await expect(round.guessTimeBars).toHaveCount(EXPECTED_BARS);
    await expect(round.guessTimeHighlighted).toHaveCount(1);
    await expect(round.guessTimeHighlighted).toHaveAttribute('data-bucket', 'nf');
  });
});

import { test, expect } from '../fixtures/test';
import type { Page } from '@playwright/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Paliers par défaut (AppSettings.AllowedDurationsSeconds) + 1 barre « ✗ ».
const EXPECTED_BARS = 7 + 1;

/** Démarre une partie, répond au 1er morceau au palier 1s et attend l'écran de révélation. */
async function revealFirstTrack(page: Page, answer: string): Promise<BlindRoundPage> {
  await page.clock.install({ time: Date.now() });
  const game = new GamePage(page);
  const round = new BlindRoundPage(page);

  await game.goto();
  await game.waitForWelcome();
  await game.clickStart();

  await round.chooseDuration(1);
  await round.waitForAnswerInput();
  await round.typeAnswer(answer);
  await round.submit();
  await round.nextButton.waitFor({ state: 'visible' });
  return round;
}

test.describe('Histogramme « en combien de temps les autres ont trouvé »', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('bonne réponse : 8 barres, colonne du palier écouté en surbrillance', async ({ page }) => {
    const round = await revealFirstTrack(page, 'Eminem - Lose Yourself');

    await expect(round.guessTimeChart).toBeVisible();
    await expect(round.guessTimeBars).toHaveCount(EXPECTED_BARS);
    await expect(round.guessTimeHighlighted).toHaveCount(1);
    await expect(round.guessTimeHighlighted).toHaveAttribute('data-bucket', 'd1');

    // L'ancienne ligne texte a disparu.
    await expect(page.getByText('Pas trouvé :')).toHaveCount(0);
    await expect(page.getByText('Ton temps :')).toHaveCount(0);
  });

  test('mauvaise réponse : la barre « ✗ » est en surbrillance', async ({ page }) => {
    const round = await revealFirstTrack(page, 'zzz réponse invalide zzz');

    await expect(round.guessTimeBars).toHaveCount(EXPECTED_BARS);
    await expect(round.guessTimeHighlighted).toHaveCount(1);
    await expect(round.guessTimeHighlighted).toHaveAttribute('data-bucket', 'nf');
  });
});

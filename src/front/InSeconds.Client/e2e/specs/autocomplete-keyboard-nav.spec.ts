import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Autocomplete Deezer — navigation clavier', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('flèche bas puis Entrée sélectionne la première suggestion', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();

    // FakeDeezerHandler (déclencheur "dedup-test") renvoie 2 suggestions nettoyées.
    await round.answerInput.fill('dedup-test');
    await page.clock.fastForward(350);
    await expect(page.getByRole('listitem')).toHaveCount(2);

    await round.answerInput.press('ArrowDown');
    await round.answerInput.press('Enter');

    await expect(round.answerInput).toHaveValue('E2E Artist - E2E Track');
  });

  test('flèche bas deux fois sélectionne la deuxième suggestion (cycle)', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();

    await round.answerInput.fill('dedup-test');
    await page.clock.fastForward(350);
    await expect(page.getByRole('listitem')).toHaveCount(2);

    await round.answerInput.press('ArrowDown');
    await round.answerInput.press('ArrowDown');
    await round.answerInput.press('Enter');

    await expect(round.answerInput).toHaveValue('Other Artist - Another Track');
  });

  test('flèche haut sans sélection active va directement à la dernière suggestion', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();

    await round.answerInput.fill('dedup-test');
    await page.clock.fastForward(350);
    await expect(page.getByRole('listitem')).toHaveCount(2);

    await round.answerInput.press('ArrowUp');
    await round.answerInput.press('Enter');

    await expect(round.answerInput).toHaveValue('Other Artist - Another Track');
  });

  test('Échap ferme la dropdown sans modifier le champ', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();

    await round.answerInput.fill('dedup-test');
    await page.clock.fastForward(350);
    await expect(page.getByRole('listitem')).toHaveCount(2);

    await round.answerInput.press('ArrowDown');
    await round.answerInput.press('Escape');

    await expect(page.getByRole('listitem')).toHaveCount(0);
    await expect(round.answerInput).toHaveValue('dedup-test');
  });
});

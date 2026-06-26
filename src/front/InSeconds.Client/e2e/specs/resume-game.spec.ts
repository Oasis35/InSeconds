import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Reprise de partie', () => {
  test('anti-cheat : paliers inférieurs à la durée écoutée masqués à la reprise', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    // Démarrer et écouter 3s sur le 1er morceau (sans soumettre)
    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    await round.chooseDuration(3);
    // Laisser le timer tourner (3s) → updateListening s'envoie
    await round.advanceClock(3);
    // Ne pas soumettre — recharger à la place
    await game.goto();
    await game.waitForResumePrompt();
    await game.resumeButton.click();

    // À la reprise, les paliers 0.5, 1, 1.5, 2 (< 3s) ne doivent plus être visibles
    await expect(round.durationButton(0.5)).not.toBeVisible();
    await expect(round.durationButton(1)).not.toBeVisible();
    await expect(round.durationButton(1.5)).not.toBeVisible();
    await expect(round.durationButton(2)).not.toBeVisible();
    // Les paliers >= 3s doivent être visibles
    await expect(round.durationButton(3)).toBeVisible();
    await expect(round.durationButton(5)).toBeVisible();
    await expect(round.durationButton(10)).toBeVisible();
  });

  test('affiche l\'écran reprise si la session est en cours', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    // Démarrer et répondre au 1er morceau seulement
    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    await round.playRound(1);

    // Recharger → écran reprise (session Pending)
    await game.goto();
    await game.waitForResumePrompt();

    // Cliquer Reprendre → morceau 2
    await game.resumeButton.click();
    await expect(page.getByText('Piste 2 / 3')).toBeVisible();
  });

  test('abandonner depuis l\'écran de reprise marque la session comme jouée', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    // Démarrer et répondre au 1er morceau
    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    await round.playRound(1);

    // Recharger → écran reprise
    await game.goto();
    await game.waitForResumePrompt();

    // Cliquer Abandonner puis confirmer
    await game.abandonButton.click();
    await game.abandonConfirmButton.click();

    // Écran abandon
    await expect(game.abandonedHeading).toBeVisible();

    // Recharger à nouveau → toujours l'écran abandon (pas resume_prompt)
    await game.goto();
    await expect(game.abandonedHeading).toBeVisible();
    await expect(game.resumePromptHeading).not.toBeVisible();
  });
});

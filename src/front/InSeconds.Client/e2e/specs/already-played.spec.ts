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

  test('affiche le message abandon quand la session est abandonnée', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    // Démarrer une partie, jouer 1 morceau
    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();
    await round.submitEmpty();
    // Ne pas aller à la piste suivante, abandonner en cours de partie

    // Cliquer Abandonner (lien dans le header pendant la partie)
    await game.abandonButton.click();
    await game.abandonConfirmButton.click();

    // Écran abandon
    await expect(game.abandonedHeading).toBeVisible();
    await expect(game.countdown).toBeVisible();

    // Recharger → toujours l'écran abandon
    await game.goto();
    await expect(game.abandonedHeading).toBeVisible();
  });
});

import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

test.describe('Pas de défi — écran 503', () => {
  test.afterEach(async ({ api }) => {
    // Restaurer le défi pour les autres specs
    await api.generateToday();
  });

  test("affiche l'écran 'Pas de défi' quand aucun challenge n'existe", async ({ page, api }) => {
    await api.reset({ deleteChallenge: true });

    const game = new GamePage(page);
    await game.goto();

    await expect(game.noChallengeHeading).toBeVisible();
    await expect(game.retryButton).toBeVisible();
  });

  test("le bouton Réessayer recharge la page", async ({ page, api }) => {
    await api.reset({ deleteChallenge: true });

    const game = new GamePage(page);
    await game.goto();
    await expect(game.noChallengeHeading).toBeVisible();

    // Régénérer le défi côté back avant de cliquer Réessayer
    await api.generateToday();
    await game.retryButton.click();

    // Après retry, le défi existe → écran welcome
    await expect(game.startButton).toBeVisible();
  });
});

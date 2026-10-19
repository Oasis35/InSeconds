import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

// La génération paresseuse (secours si la tâche de minuit a raté) a lieu au démarrage d'une partie, pas à la lecture de l'état du jour
// (GET /api/daily/today ne génère rien) : l'écran « pas de défi » s'affiche, et « Réessayer » tente le démarrage, qui génère le défi si le
// pool le permet. Il ne subsiste durablement que si le pool est insuffisant (emptyPool).
test.describe('Pas de défi — état no_challenge', () => {
  test.afterEach(async ({ api }) => {
    // Restaurer pool + défis pour les autres specs
    await api.reseed();
  });

  test("affiche l'écran 'Pas de défi' quand aucun challenge n'existe et que le pool est vide", async ({ page, api }) => {
    await api.reset({ deleteChallenge: true, emptyPool: true });

    const game = new GamePage(page);
    await game.goto();

    await expect(game.noChallengeHeading).toBeVisible();
    await expect(game.retryButton).toBeVisible();
  });

  test('le défi supprimé renaît tout seul au premier joueur (génération paresseuse)', async ({ page, api }) => {
    await api.reset({ deleteChallenge: true });

    const game = new GamePage(page);
    await game.goto();

    // En v2, la lecture de l'état du jour ne génère rien : l'écran « pas de défi » s'affiche, et « Réessayer » tente le démarrage, qui
    // régénère le défi à la volée (le tirage du secours est celui de minuit). Le joueur arrive directement dans la partie.
    await expect(game.noChallengeHeading).toBeVisible();
    await game.retryButton.click();

    await expect(page.getByText('Piste 1 / 5')).toBeVisible();
  });

  test('le bouton Réessayer recharge la page', async ({ page, api }) => {
    await api.reset({ deleteChallenge: true, emptyPool: true });

    const game = new GamePage(page);
    await game.goto();
    await expect(game.noChallengeHeading).toBeVisible();

    // Restaurer le pool côté back avant de cliquer Réessayer
    await api.reseed();
    await game.retryButton.click();

    // Après retry, le défi existe → écran welcome
    await expect(game.startButton).toBeVisible();
  });
});

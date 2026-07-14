import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

// Depuis la génération paresseuse dans StartSession, supprimer le défi ne suffit
// plus : il renaît au premier joueur. L'écran « pas de défi » ne subsiste que si
// le pool est insuffisant (emptyPool) — c'est le scénario testé ici.
test.describe('Pas de défi — écran 503', () => {
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

    // Pas d'écran « pas de défi » : StartSession a régénéré le défi à la volée
    await expect(game.startButton).toBeVisible();
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

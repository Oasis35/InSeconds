import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// La carte du défi joué, sur l'accueil : « mieux que X % » quand la partie n'a pas de moment fort, à partir de 5 joueurs.
// Réponses vides partout → tous les scores valent 0. (L'égaliseur des scores vit dans les réponses des jours passés.)
test.describe('Mieux que X % des joueurs', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('score final : pas de phrase en % quand on joue seul', async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    await expect(page.getByTestId('home-score')).toBeVisible();
    await expect(page.getByTestId('score-better-than')).toHaveCount(0);
  });

  test('déjà joué : phrase en % affichée à partir de 5 joueurs', async ({ page, api }) => {
    for (let i = 0; i < 4; i++) {
      await api.completeSessionAsNewGuest();
    }

    await page.clock.install({ time: Date.now() });
    const game = new GamePage(page);
    await game.completeGameThenReload(new BlindRoundPage(page));

    await expect(game.alreadyPlayedScreen).toBeVisible();
    // 5 joueurs à 0 pt : personne n'est strictement en dessous.
    await expect(page.getByTestId('score-better-than')).toHaveText(/Tu fais mieux que\s+0 %\s+des joueurs/);
  });
});

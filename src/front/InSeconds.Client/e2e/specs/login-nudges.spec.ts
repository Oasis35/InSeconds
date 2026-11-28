import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';
import { loginAsPlayer } from '../fixtures/player-login';

test.describe('Nudges de connexion (guest)', () => {
  test("un nouveau visiteur ne voit que « Commencer » : aucune tuile « crée un compte »", async ({ page, api }) => {
    await api.reset();

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    await expect(page.getByTestId('guest-tile')).toHaveCount(0);
    await expect(page.getByTestId('friends-card')).toHaveCount(0);
  });

  test('affiche le CTA de connexion sur l\'écran de reprise', async ({ page, api }) => {
    await api.reset();

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    await round.playRound(1);
    await game.goto();
    await game.waitForResumePrompt();

    await expect(page.getByRole('link', { name: 'Ne plus perdre mes parties' })).toBeVisible();
  });

  test('un compte connecté ne voit aucune tuile « crée un compte » sur le récap final', async ({ page, api }) => {
    await api.reset();
    await loginAsPlayer(page, 'nudges-recap@example.com', 'NudgesRecapE2E');
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    await expect(game.doneScreen).toBeVisible();
    await expect(page.getByTestId('guest-tile')).toHaveCount(0);
  });

  test("un compte connecté ne voit aucune tuile « crée un compte » sur l'écran déjà joué", async ({ page, api }) => {
    await api.reset();
    await loginAsPlayer(page, 'nudges-played@example.com', 'NudgesPlayedE2E');
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.completeGameThenReload(new BlindRoundPage(page));

    await expect(game.alreadyPlayedScreen).toBeVisible();
    await expect(page.getByTestId('guest-tile')).toHaveCount(0);
  });

  test("fin de partie : la tuile « Ta partie est sur ce téléphone » mène à la connexion, la croix la ferme", async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    const tile = page.getByTestId('guest-tile');
    await expect(tile).toHaveAttribute('data-kind', 'afterGame');
    await expect(tile).toContainText('Ta partie est sur ce téléphone');

    await tile.getByTestId('guest-tile-dismiss').click();
    await expect(tile).toBeHidden();

    // Fermée pour de bon : elle ne revient pas au rechargement.
    await page.reload();
    await expect(game.alreadyPlayedScreen).toBeVisible();
    await expect(page.getByTestId('guest-tile')).toHaveCount(0);
  });

  test("fin de partie : « Créer un compte » de la tuile mène à /login", async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));
    await page.getByTestId('guest-tile-create').click();

    await expect(page).toHaveURL(/\/login$/);
  });
});

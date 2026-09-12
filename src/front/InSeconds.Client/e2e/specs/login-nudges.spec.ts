import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Nudges de connexion (guest)', () => {
  test('affiche le CTA de connexion sur l\'écran d\'accueil', async ({ page, api }) => {
    await api.reset();

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    await expect(page.getByRole('link', { name: 'Se connecter / Créer un compte' })).toBeVisible();
  });

  test('le CTA de l\'accueil mène à /login', async ({ page, api }) => {
    await api.reset();

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();
    await page.getByRole('link', { name: 'Se connecter / Créer un compte' }).click();

    await expect(page).toHaveURL(/\/login$/);
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

  test('affiche la bannière "Garde ce score" sur le récap final', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    await expect(page.getByText('Garde ce score')).toBeVisible();
    await expect(page.getByText('Il disparaîtra si tu changes de navigateur.')).toBeVisible();
  });

  test('affiche la bannière "Reviens sur n\'importe quel appareil" sur l\'écran déjà joué', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.completeGameThenReload(new BlindRoundPage(page));

    await expect(game.alreadyPlayedHeading).toBeVisible();
    await expect(page.getByText('Reviens sur n\'importe quel appareil')).toBeVisible();
    await expect(page.getByText(/Ta série de \d+ jours te suivra\./)).toBeVisible();
  });

  test('affiche puis masque le toast de série sur le récap final', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    const toast = page.getByText(/Série de \d+ jours\./);
    await expect(toast).toBeVisible();
    await expect(page.getByRole('link', { name: 'Créer' })).toBeVisible();

    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(toast).toBeHidden();
  });
});

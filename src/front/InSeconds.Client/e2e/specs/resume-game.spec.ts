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
    // Laisser le timer tourner jusqu'à 3s (auto-play 0.5s + prolongations) → updateListening s'envoie
    const listeningPatch = page.waitForResponse(
      r => /\/api\/sessions\/\d+\/listening$/.test(r.url()) && r.request().method() === 'PATCH'
    );
    await round.chooseDuration(3);
    // Attendre que le PATCH /listening soit parti ET persisté avant de recharger
    await listeningPatch;
    // Ne pas soumettre — recharger à la place
    await game.goto();
    await game.waitForResumePrompt();
    await game.resumeButton.click();

    // À la reprise, la lecture démarre automatiquement au 1er palier autorisé restant :
    // les paliers 0.5, 1, 1.5, 2 (< 3s déjà écoutées) doivent être exclus par l'anti-cheat,
    // donc l'auto-play choisit directement 3s.
    await round.waitForAnswerInput();
    await expect(page.getByText('3s / 3s')).toBeVisible();
    // Le bouton « écouter plus » ne doit proposer que des paliers >= 3s (le suivant est 5s)
    await expect(round.listenMoreButton).toHaveText(/jusqu'à 5s/);
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

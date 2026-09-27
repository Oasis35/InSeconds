import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// E4 (revue de code du 2026-09-25) : un échec de lecture de l'aperçu (URL de preview
// expirée, autoplay refusé...) ne doit plus relancer `startPlay()` en boucle infinie —
// l'effect() d'autoplay ne se redéclenche que sur `audio.isIdle()`, donc l'échec doit
// basculer vers un état 'error' distinct, jamais 'idle'. Ce spec intercepte la requête
// réseau réelle vers l'aperçu (`test-audio.mp3`, servi en mode Testing par FakeDeezerHandler,
// cf. CLAUDE.md racine) et vérifie le comportement dans un vrai navigateur, contrairement
// aux tests unitaires qui stubbent entièrement AudioPlayerService.
test.describe('Échec de lecture audio', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test("bloque une seule tentative, sans boucle de requêtes, et masque la saisie", async ({ page }) => {
    let requestCount = 0;
    await page.route('**/test-audio.mp3', async (route) => {
      requestCount++;
      await route.abort('failed');
    });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    // État d'erreur affiché, avec les deux issues possibles.
    await expect(page.getByText("Impossible de lire l'aperçu. Réessaie, ou passe ce morceau.")).toBeVisible();
    await expect(game.retryButton).toBeVisible();
    await expect(page.getByRole('button', { name: /^Passer/ })).toBeVisible();

    // Le formulaire de réponse ne doit pas être affiché tant que la lecture n'a pas repris.
    await expect(round.answerInput).not.toBeVisible();

    // Laisse le temps à un éventuel bug de boucle de se manifester (plusieurs tentatives auto).
    await page.waitForTimeout(1500);
    expect(requestCount).toBe(1);
  });

  test("« Réessayer » relance la lecture et permet de terminer le morceau normalement", async ({ page }) => {
    let shouldFail = true;
    await page.route('**/test-audio.mp3', async (route) => {
      if (shouldFail) {
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await expect(page.getByText("Impossible de lire l'aperçu. Réessaie, ou passe ce morceau.")).toBeVisible();

    shouldFail = false;
    await game.retryButton.click();

    // La lecture repart avec succès : la zone de saisie redevient visible.
    await round.waitForAnswerInput();
    await round.submitEmpty();
    await round.goNext();
  });

  test('« Passer » permet de continuer la partie sans avoir pu écouter le morceau', async ({ page }) => {
    await page.route('**/test-audio.mp3', route => route.abort('failed'));

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await expect(page.getByText("Impossible de lire l'aperçu. Réessaie, ou passe ce morceau.")).toBeVisible();

    await page.getByRole('button', { name: /^Passer/ }).click();

    // 0 point marqué, mais le round avance normalement jusqu'au résultat.
    const score = await round.readRoundScore();
    expect(score).toBe(0);
    await round.goNext();
  });
});

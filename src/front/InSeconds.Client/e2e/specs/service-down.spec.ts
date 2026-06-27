import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

test.describe('Service indisponible — backend KO', () => {
  test.beforeEach(async ({ api, page }) => {
    await api.reset();
    // Ce spec teste précisément l'overlay : on réactive le polling /health que le
    // fixture désactive par défaut pour les autres tests.
    await page.addInitScript(() => {
      (window as { __disableHealthPolling?: boolean }).__disableHealthPolling = false;
    });
  });

  test("affiche l'overlay quand /health échoue, puis le retire au retour du backend", async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    // Simuler un backend KO : /health renvoie une erreur réseau.
    let healthDown = true;
    await page.route('**/health', async (route) => {
      if (healthDown) {
        await route.abort('failed');
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', utc: new Date().toISOString() }),
        });
      }
    });

    const game = new GamePage(page);
    await game.goto();

    // Un seul échec ne doit PAS masquer l'app (tolérance au hoquet transitoire).
    await expect(game.serviceDownHeading).not.toBeVisible();

    // Après le seuil d'échecs consécutifs (3 polls), l'overlay bloquant s'affiche.
    await page.clock.runFor(15000);
    await expect(game.serviceDownHeading).toBeVisible();

    // Le backend revient. Au prochain poll (5s), l'overlay disparaît tout seul.
    healthDown = false;
    await page.clock.runFor(5000);

    await expect(game.serviceDownHeading).not.toBeVisible();
  });

  test("ne montre pas l'overlay au démarrage tant que /health n'a pas répondu", async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    // /health pend indéfiniment (jamais résolu) → l'app reste en 'loading'.
    await page.route('**/health', () => {
      /* ne jamais répondre */
    });

    const game = new GamePage(page);
    await game.goto();

    // État 'loading' : pas d'overlay (faux positif évité au boot).
    await expect(game.serviceDownHeading).not.toBeVisible();
  });
});

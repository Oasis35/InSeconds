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

    // Échec de la prochaine sonde /health. Chaque tick du polling est avancé séparément et
    // attendu jusqu'à son échec : un runFor(15000) d'un bloc déclenchait les ticks quasi
    // simultanément, et switchMap annulait la requête encore en vol à chaque nouveau tick.
    // Une requête annulée n'est pas comptée comme échec : le seuil de 3 n'était atteint que
    // si les abort de page.route gagnaient la course (test instable).
    const isHealth = (url: string) => new URL(url).pathname === '/health';
    const nextHealthFailure = () => page.waitForEvent('requestfailed', (r) => isHealth(r.url()));

    const game = new GamePage(page);
    let failure = nextHealthFailure();
    await game.goto();
    await failure; // 1er échec (tick immédiat au démarrage)

    // Un seul échec ne doit PAS masquer l'app (tolérance au hoquet transitoire).
    await expect(game.serviceDownHeading).not.toBeVisible();

    // 2e échec : toujours pas d'overlay.
    failure = nextHealthFailure();
    await page.clock.runFor(5000);
    await failure;
    await expect(game.serviceDownHeading).not.toBeVisible();

    // 3e échec consécutif = seuil atteint : l'overlay bloquant s'affiche.
    failure = nextHealthFailure();
    await page.clock.runFor(5000);
    await failure;
    await expect(game.serviceDownHeading).toBeVisible();

    // Le backend revient. Au prochain poll (5s), l'overlay disparaît tout seul.
    healthDown = false;
    const recovered = page.waitForResponse((r) => isHealth(r.url()));
    await page.clock.runFor(5000);
    await recovered;

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

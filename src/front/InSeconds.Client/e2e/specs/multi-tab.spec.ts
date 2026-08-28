import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Depuis le décalage de la création de session au clic « Commencer à jouer », un simple
// chargement de page ne pose plus de cookie. Il faut donc démarrer une partie (clickStart)
// pour qu'un cookie guest + une session Pending existent, avant de simuler l'autre onglet.

// Simule le retour au premier plan d'un onglet (visibilitychange visible)
async function simulateTabFocus(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

// Extrait le cookie d'authentification du contexte browser courant
async function getCookieHeader(page: import('@playwright/test').Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

test.describe('Multi-onglets — synchronisation état', () => {
  test('repasse sur already_played si la partie a été complétée dans un autre onglet', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    // Onglet 1 : démarrer une partie → pose le cookie guest + session Pending
    const game1 = new GamePage(page);
    const round1 = new BlindRoundPage(page);
    await game1.goto();
    await game1.waitForWelcome();
    await game1.clickStart();
    await round1.waitForAnswerInput();

    // Simuler un autre onglet : compléter la partie via API avec le même cookie
    const cookieHeader = await getCookieHeader(page);
    await api.completeSessionAs(cookieHeader);

    // Retour sur l'onglet 1 : simuler le focus → peek → already_played
    await simulateTabFocus(page);

    await expect(game1.alreadyPlayedHeading).toBeVisible({ timeout: 5000 });
  });

  test('repasse sur already_played si la partie a été abandonnée dans un autre onglet', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    // Onglet 1 : démarrer une partie → pose le cookie guest + session Pending
    const game1 = new GamePage(page);
    const round1 = new BlindRoundPage(page);
    await game1.goto();
    await game1.waitForWelcome();
    await game1.clickStart();
    await round1.waitForAnswerInput();

    // Simuler un autre onglet : abandonner via API avec le même cookie
    const cookieHeader = await getCookieHeader(page);
    await api.abandonSessionAs(cookieHeader);

    // Retour sur l'onglet 1 : simuler le focus → peek → abandoned
    await simulateTabFocus(page);

    await expect(game1.abandonedHeading).toBeVisible({ timeout: 5000 });
  });

  test('ne recharge pas la session si le jeu est déjà terminé', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    // Compléter la partie sur cet onglet
    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();
    for (let i = 0; i < 3; i++) {
      await round.playRound(1);
    }
    await game.waitForDone();

    // Simuler un retour au premier plan — l'écran done ne doit pas changer
    await simulateTabFocus(page);
    await expect(game.finalScoreLabel).toBeVisible();
    await expect(game.alreadyPlayedHeading).not.toBeVisible();
  });
});

import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Simule le retour au premier plan d'un onglet (visibilitychange visible)
async function simulateTabFocus(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('Multi-onglets — synchronisation état', () => {
  test('repasse sur already_played si la partie a été complétée dans un autre onglet', async ({ page, api, browser }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    // Onglet 1 : charger la page, arriver à l'écran welcome
    const game1 = new GamePage(page);
    await game1.goto();
    await game1.waitForWelcome();

    // Onglet 2 : compléter la partie entière dans un autre contexte (même cookies)
    const context2 = await browser.newContext({ storageState: await page.context().storageState() });
    const page2 = await context2.newPage();
    await page2.clock.install({ time: Date.now() });
    const game2 = new GamePage(page2);
    const round2 = new BlindRoundPage(page2);
    await game2.goto();
    await game2.waitForWelcome();
    await game2.clickStart();
    for (let i = 0; i < 3; i++) {
      await round2.playRound(1);
    }
    await game2.waitForDone();
    await context2.close();

    // Retour sur l'onglet 1 : simuler le focus
    await simulateTabFocus(page);

    // L'onglet 1 doit passer en already_played
    await expect(game1.alreadyPlayedHeading).toBeVisible({ timeout: 5000 });
  });

  test('repasse sur already_played si la partie a été abandonnée dans un autre onglet', async ({ page, api, browser }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    // Onglet 1 : charger la page, arriver à l'écran welcome
    const game1 = new GamePage(page);
    await game1.goto();
    await game1.waitForWelcome();

    // Onglet 2 : démarrer et abandonner
    const context2 = await browser.newContext({ storageState: await page.context().storageState() });
    const page2 = await context2.newPage();
    await page2.clock.install({ time: Date.now() });
    const game2 = new GamePage(page2);
    const round2 = new BlindRoundPage(page2);
    await game2.goto();
    await game2.waitForWelcome();
    await game2.clickStart();
    await round2.chooseDuration(1);
    await round2.advanceClock(1);
    await round2.waitForAnswerInput();
    await round2.submitEmpty();
    await game2.abandonButton.click();
    await game2.abandonConfirmButton.click();
    await expect(game2.abandonedHeading).toBeVisible();
    await context2.close();

    // Retour sur l'onglet 1 : simuler le focus
    await simulateTabFocus(page);

    // L'onglet 1 doit afficher l'écran abandon
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

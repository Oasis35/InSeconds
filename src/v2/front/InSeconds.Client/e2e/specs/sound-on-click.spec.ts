import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Les navigateurs ne jouent un son qu'après un geste du joueur ; sans geste, Howler attend en silence, sans erreur (l'écran afficherait
// « lecture en cours » sans rien entendre). Le premier morceau part donc du clic « Commencer » ou « Reprendre » : jamais à l'arrivée sur
// la page, ni au retour de l'onglet au premier plan. Les extraits se chargent dès que la manche démarre : leur requête est le signe
// que la manche a démarré.
async function countAudioRequests(page: Page): Promise<() => number> {
  let count = 0;
  await page.route('**/test-audio.mp3', async route => {
    count++;
    await route.continue();
  });
  return () => count;
}

/** Retour au premier plan de l'onglet (visibilitychange visible). */
async function simulateTabFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('Le son ne démarre que sur un clic', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test("l'arrivée sur la page n'envoie aucun son ; « Commencer » lance la manche", async ({ page }) => {
    const audioRequests = await countAudioRequests(page);
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await simulateTabFocus(page);
    // La relecture de l'état du jour est faite (réseau au repos) : si elle devait lancer la manche, l'extrait serait déjà demandé.
    await page.waitForLoadState('networkidle');
    expect(audioRequests()).toBe(0);
    await expect(round.timer).toHaveCount(0);

    await game.clickStart();

    await expect(round.timer).toBeVisible();
    await expect.poll(audioRequests).toBeGreaterThan(0);
  });

  test("après un rechargement, la partie reprise ne se relance pas toute seule : « Reprendre » lance la manche", async ({ page }) => {
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.startFirstRound(round, 0.5);

    await page.reload();
    const audioRequests = await countAudioRequests(page);
    await game.waitForResumePrompt();
    await simulateTabFocus(page);
    // La relecture de l'état du jour est faite (réseau au repos) : si elle devait lancer la manche, l'extrait serait déjà demandé.
    await page.waitForLoadState('networkidle');
    expect(audioRequests()).toBe(0);
    await expect(round.timer).toHaveCount(0);

    await game.resumeButton.click();

    await expect(round.timer).toBeVisible();
    await expect.poll(audioRequests).toBeGreaterThan(0);
  });

  test('le morceau suivant ne part que sur « Piste suivante »', async ({ page }) => {
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.startFirstRound(round, 0.5);
    await round.submitEmpty();
    await round.nextButton.waitFor({ state: 'visible' });

    // La révélation rejoue le morceau répondu ; le morceau suivant n'est pas démarré tant qu'on n'a pas cliqué.
    await expect(page.getByText('Piste 1 / 5')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Piste 2 / 5')).toHaveCount(0);

    await round.goNext();

    await expect(page.getByText('Piste 2 / 5')).toBeVisible();
    await expect(round.timer).toBeVisible();
  });
});

import { devices } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Safari sur iPhone zoome sur un champ dont le texte fait moins de 16 px quand on le touche, et garde ce zoom (page coupée à droite
// jusqu'à la fin de la partie, signalé sur le staging le 13/10/2026). Sur un écran tactile, les champs sont donc à 16 px au moins.
// Chromium ne zoome pas : on vérifie la taille du texte du champ, et que la page ne déborde pas de l'écran.
const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['iPhone 13'];
test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

test.describe('Champ de réponse sur téléphone', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('le champ de réponse est en 16 px au moins, sans débordement de la page', async ({ page }) => {
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.startFirstRound(round, 0.5);

    await round.answerInput.tap();
    const fontSize = await round.answerInput.evaluate(input => Number.parseFloat(getComputedStyle(input).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

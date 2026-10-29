import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

/**
 * Le fixture marque le message comme vu à chaque chargement. Ce script (lancé après lui) l'oublie au premier chargement de la page, et à
 * celui qui suit `forgetOnNextLoad` : ailleurs, ce que l'app a noté est gardé.
 */
async function forgetThanks(page: Page, onFirstLoad: boolean): Promise<void> {
  await page.addInitScript(first => {
    const firstLoad = sessionStorage.getItem('thanks-e2e-loaded') === null;
    sessionStorage.setItem('thanks-e2e-loaded', '1');
    if ((first && firstLoad) || sessionStorage.getItem('thanks-e2e-forget') === '1') {
      sessionStorage.removeItem('thanks-e2e-forget');
      localStorage.removeItem('inseconds.thanksNoticeSeen');
    }
  }, onFirstLoad);
}

async function forgetOnNextLoad(page: Page): Promise<void> {
  await page.evaluate(() => sessionStorage.setItem('thanks-e2e-forget', '1'));
}

test.describe('Message de remerciement', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test("s'ouvre après la partie, invite un ami, puis ne revient plus", async ({ page }) => {
    await forgetThanks(page, true);
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await game.finishGame(new BlindRoundPage(page), 5);

    const dialog = page.getByRole('dialog', { name: /Merci de faire vivre InSeconds/ });
    await expect(dialog).toBeHidden();
    await page.clock.runFor(1600);
    await expect(dialog).toBeVisible();
    // Une partie terminée (celle-ci) : moins de dix, le message se dit sans chiffre.
    await expect(dialog.getByText('toutes les parties jouées')).toBeVisible();
    await expect(dialog.getByText('nouveau mode de jeu')).toBeVisible();

    await dialog.getByRole('button', { name: 'Défie un ami' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Lien copié, tu n'as plus qu'à le coller")).toBeVisible();
    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipText).toContain('Je joue à InSeconds, un blind test par jour.');
    expect(clipText).toMatch(/https?:\/\/[^/]+\/\?utm_source=share$/);

    // Rechargement : écran « déjà joué », le message ne revient pas.
    await game.goto();
    await expect(game.alreadyPlayedScreen).toBeVisible();
    await page.clock.runFor(2000);
    await expect(dialog).toBeHidden();
  });

  test("s'ouvre aussi sur « déjà joué », se ferme par « Continuer »", async ({ page }) => {
    await forgetThanks(page, false);
    const game = new GamePage(page);
    // Partie jouée avec le message déjà vu (fixture), puis retour sur la page sans l'avoir jamais vu.
    await page.clock.install({ time: Date.now() });
    await game.completeGameThenReload(new BlindRoundPage(page));
    await expect(game.alreadyPlayedScreen).toBeVisible();
    await forgetOnNextLoad(page);

    await game.goto();
    await expect(game.alreadyPlayedScreen).toBeVisible();
    await page.clock.runFor(1000);
    const dialog = page.getByRole('dialog', { name: /Merci de faire vivre InSeconds/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuer' }).click();
    await expect(dialog).toBeHidden();
  });
});

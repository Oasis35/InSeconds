import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';
import { linkAccount } from '../pages/login.page';
import { ApiTestClient } from '../fixtures/api-client';

/**
 * Gel de série (maquette InSeconds Game.dc.html) : gélule du header, panneau série/gel,
 * accueil « Bon retour ! », toasts de fin de partie et toast invité « série perdue ».
 * L'état de série est posé via POST /api/e2e/set-streak (Testing-only).
 */

/** Résout (ou crée, pour un invité) le Player du navigateur et renvoie son ID. */
async function currentPlayerId(page: Page): Promise<string> {
  const res = await page.request.get('/api/players/me');
  const body = (await res.json()) as { playerId: string };
  return body.playerId;
}

async function setStreak(
  page: Page,
  api: ApiTestClient,
  state: { streak: number; lastPlayedDaysAgo: number | null; freezes: number },
): Promise<void> {
  await api.setStreak(await currentPlayerId(page), state);
}

const pill = (page: Page) => page.getByTestId('streak-pill');
const sheet = (page: Page) => page.getByTestId('streak-sheet');

test.describe('Gel de série — compte connecté', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('série active : la gélule affiche série et gels, le panneau le stock et la progression', async ({ page, api }) => {
    await linkAccount(page, api, 'freeze-active@e2e.test', 'FreezeActifE2E');
    await setStreak(page, api, { streak: 12, lastPlayedDaysAgo: 1, freezes: 2 });

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    await expect(pill(page)).toHaveAttribute('data-mode', 'on');
    await expect(pill(page)).toContainText('12');
    await pill(page).click();

    await expect(sheet(page)).toHaveAttribute('data-variant', 'linked');
    await expect(sheet(page).getByText('Série de 12 jours')).toBeVisible();
    await expect(sheet(page).getByText('Tes gels · 2 / 2')).toBeVisible();
    await expect(sheet(page).getByText('Prochain gel à 14 jours')).toBeVisible();
    await expect(sheet(page).getByText('encore 2 jours')).toBeVisible();

    await sheet(page).getByRole('button', { name: 'Fermer' }).click();
    await expect(sheet(page)).toBeHidden();
  });

  test('série protégée : « Bon retour ! », panneau avec frise, puis toast « 1 gel a sauvé ta série »', async ({ page, api }) => {
    await page.clock.install({ time: Date.now() });
    await linkAccount(page, api, 'freeze-protected@e2e.test', 'FreezeProtegeE2E');
    await setStreak(page, api, { streak: 12, lastPlayedDaysAgo: 2, freezes: 1 });

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    await expect(page.getByRole('heading', { name: 'Bon retour !' })).toBeVisible();
    await expect(page.getByTestId('frozen-line')).toContainText('12 jours de série');
    await expect(pill(page)).toHaveAttribute('data-mode', 'protected');

    await pill(page).click();
    await expect(sheet(page)).toHaveAttribute('data-variant', 'protected');
    await expect(sheet(page).getByText('Tu as manqué hier, ta série de 12 jours tient toujours.')).toBeVisible();
    await sheet(page).getByRole('button', { name: 'Plus tard' }).click();

    await game.clickStart();
    const round = new BlindRoundPage(page);
    for (let i = 0; i < 5; i++) {
      await round.playRound(1);
    }
    await game.waitForDone();

    await expect(page.getByTestId('gel-used-toast')).toContainText('1 gel a sauvé ta série !');
    await expect(page.getByTestId('gel-used-toast')).toContainText('ta série de 13 jours continue');
  });

  test('palier de 7 jours : toast « +1 gel gagné ! »', async ({ page, api }) => {
    await page.clock.install({ time: Date.now() });
    await linkAccount(page, api, 'freeze-earned@e2e.test', 'FreezeGagneE2E');
    await setStreak(page, api, { streak: 6, lastPlayedDaysAgo: 1, freezes: 1 });

    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    await expect(page.getByTestId('gel-earned-toast')).toContainText('+1 gel');
    await expect(page.getByTestId('gel-earned-toast')).toContainText('7 jours de série');
    await expect(pill(page)).toContainText('7');
  });
});

test.describe('Gel de série — invité', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('série perdue : toast une seule fois, CTA de connexion masqué pendant le toast', async ({ page, api }) => {
    await page.goto('/');
    await setStreak(page, api, { streak: 6, lastPlayedDaysAgo: 3, freezes: 0 });

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    const toast = page.getByTestId('lost-streak-toast');
    await expect(toast).toContainText('6 jours');
    await expect(toast).toContainText('Le premier est offert.');
    await expect(pill(page)).toHaveAttribute('data-mode', 'lost');
    await expect(page.getByText('Pour garder ta série sur tous tes appareils.')).toBeHidden();

    await toast.getByRole('button', { name: 'Fermer' }).click();
    await expect(toast).toBeHidden();

    // Rechargement : déjà vu pour cette série perdue.
    await game.goto();
    await game.waitForWelcome();
    await expect(page.getByTestId('lost-streak-toast')).toBeHidden();
  });

  test('le panneau présente le gel comme un avantage du compte', async ({ page, api }) => {
    await page.goto('/');
    await setStreak(page, api, { streak: 4, lastPlayedDaysAgo: 1, freezes: 0 });

    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    await expect(pill(page)).toHaveAttribute('data-mode', 'guest');
    await pill(page).click();
    await expect(sheet(page)).toHaveAttribute('data-variant', 'guest');
    await sheet(page).getByRole('button', { name: 'Créer un compte' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('palier de 7 jours : « Tu aurais gagné un gel ! » remplace la carte « Reviens sur n\'importe quel appareil »', async ({ page, api }) => {
    await page.clock.install({ time: Date.now() });
    await page.goto('/');
    await setStreak(page, api, { streak: 6, lastPlayedDaysAgo: 1, freezes: 0 });

    const game = new GamePage(page);
    await game.completeGameThenReload(new BlindRoundPage(page));

    await expect(game.alreadyPlayedHeading).toBeVisible();
    await expect(page.getByText('Tu aurais gagné un gel !')).toBeVisible();
    await expect(page.getByText('Reviens sur n\'importe quel appareil')).toBeHidden();
  });
});

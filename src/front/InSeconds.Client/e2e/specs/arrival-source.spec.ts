import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Source d'arrivée d'un invité (#445) : le utm_source du lien est lu à l'ouverture, survit à la redirection vers /daily et
// part avec la création de l'invité au premier « Commencer ». Lue ici dans la copie des données du joueur.

test.describe("Source d'arrivée", () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  async function startGame(page: Page, path: string): Promise<void> {
    await page.clock.install({ time: Date.now() });
    const game = new GamePage(page);
    await page.goto(path);
    await game.waitForWelcome();
    await game.clickStart();
    await new BlindRoundPage(page).chooseDuration(1);
  }

  async function acquisitionSource(page: Page): Promise<string | null> {
    const response = await page.request.get('/api/players/me/export');
    expect(response.ok()).toBe(true);
    return (await response.json()).acquisitionSource;
  }

  test("un lien marqué utm_source note la source de l'invité", async ({ page }) => {
    await startGame(page, '/?utm_source=Instagram');

    expect(await acquisitionSource(page)).toBe('instagram');
  });

  test('sans source, arrivée directe', async ({ page }) => {
    await startGame(page, '/');

    expect(await acquisitionSource(page)).toBe('direct');
  });
});

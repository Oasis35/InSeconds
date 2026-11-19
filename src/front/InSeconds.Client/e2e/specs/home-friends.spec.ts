import { Browser, Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { BlindRoundPage } from '../pages/blind-round.page';
import { GamePage } from '../pages/game.page';
import { RunPage } from '../pages/run.page';

// La carte amis de l'accueil, sous la carte du défi : « Créer un compte » pour un invité, « Créer un groupe » pour un compte sans groupe ; pour un
// membre, qui a joué dans son groupe tant que son défi reste à faire (sans scores), puis le haut du classement du jour une fois le défi fait.

/** Un autre joueur dans son propre navigateur, avec les mêmes réglages de test que `page`. */
async function otherPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    (window as { __disableAnimations?: boolean }).__disableAnimations = true;
    (window as { __disableHealthPolling?: boolean }).__disableHealthPolling = true;
    try {
      localStorage.setItem('lang', 'fr');
    } catch {
      // localStorage indisponible - ignore
    }
  });
  return context.newPage();
}

test.describe("Accueil : la carte amis", () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test("un invité : « Créer un compte » mène à la connexion", async ({ page }) => {
    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    const card = page.getByTestId('friends-card');
    await expect(card).toHaveAttribute('data-kind', 'guest');
    await card.getByTestId('friends-card-login').click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("un compte sans groupe : « Créer un groupe » ouvre la création", async ({ page }) => {
    await new RunPage(page).loginAsPlayer('nina-accueil@e2e.test', 'NinaAccueil');
    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    const card = page.getByTestId('friends-card');
    await expect(card).toHaveAttribute('data-kind', 'no_group');
    await card.getByTestId('friends-card-create').click();
    await expect(page).toHaveURL(/\/ranking\/new$/);
  });

  test("un membre : qui a joué avant son défi, sans scores ; le classement du jour après", async ({ page, browser }) => {
    test.slow();

    // Léa crée « Les potes », Tom le rejoint par le lien et joue le défi du jour.
    await new RunPage(page).loginAsPlayer('lea-accueil@e2e.test', 'LeaAccueil');
    const created = await page.request.post('/api/social/groups', { data: { name: 'Les potes' } });
    expect(created.ok()).toBe(true);
    const group = (await created.json()) as { id: number; inviteCode: string };

    const friendPage = await otherPlayer(browser);
    await new RunPage(friendPage).loginAsPlayer('tom-accueil@e2e.test', 'TomAccueil');
    expect((await friendPage.request.post(`/api/social/invitations/${group.inviteCode}/join`)).ok()).toBe(true);
    await friendPage.clock.install({ time: Date.now() });
    await new GamePage(friendPage).playFullGame(new BlindRoundPage(friendPage));
    await friendPage.context().close();

    // Avant son défi : le groupe, « 1 sur 2 a joué », une pastille par membre, aucun score.
    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();
    const card = page.getByTestId('friends-card');
    await expect(card).toHaveAttribute('data-kind', 'pending');
    await expect(card.getByTestId('friends-card-title')).toHaveText('Les potes');
    await expect(card.getByTestId('friends-card-played')).toHaveText('1 sur 2 a joué');
    await expect(card.getByTestId('friends-card-member')).toHaveCount(2);
    await expect(card.locator('[data-testid="friends-card-member"][data-played="true"]')).toHaveCount(1);
    await expect(card.getByTestId('friends-card-score')).toHaveCount(0);

    // Son défi fini, la carte suit : « Les potes, aujourd'hui » et les deux lignes du classement du jour, la sienne marquée.
    await page.clock.install({ time: Date.now() });
    await game.playFullGame(new BlindRoundPage(page));
    await expect(card).toHaveAttribute('data-kind', 'revealed');
    await expect(card.getByTestId('friends-card-title')).toHaveText("Les potes, aujourd'hui");
    await expect(card.getByTestId('friends-card-row')).toHaveCount(2);
    await expect(card.locator('[data-testid="friends-card-row"][data-me="true"]')).toHaveCount(1);

    // « Classement » ouvre le classement du jour de ce groupe.
    await card.getByTestId('friends-card-ranking').click();
    await expect(page).toHaveURL(new RegExp(`/ranking\\?group=${group.id}&period=today$`));
  });
});

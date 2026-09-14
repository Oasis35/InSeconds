import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { linkAccount } from '../pages/login.page';

const EMAIL_A = 'profile-a@e2e.test';
const EMAIL_B = 'profile-b@e2e.test';

test.describe('Profil', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('l\'avatar du header (compte connecté) mène au profil', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL_A, 'AvatarUserE2E');

    const game = new GamePage(page);
    await game.waitForWelcome();

    // Le footer porte aussi une icône avec le même `title` — scoper au header.
    await page.locator('app-game-header').getByTitle('AvatarUserE2E').click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('change de pseudo avec succès', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL_A, 'AncienPseudoE2E');

    const game = new GamePage(page);
    await game.waitForWelcome();
    await page.goto('/profile');

    await expect(page.getByText('Série')).toBeVisible();
    await expect(page.getByText('Parties jouées')).toBeVisible();

    await page.getByPlaceholder('Ton pseudo').fill('NouveauPseudoE2E');
    await page.getByRole('button', { name: 'Changer' }).click();

    await expect(page.getByText('Pseudo mis à jour.')).toBeVisible();
  });

  test('refuse un pseudo déjà pris', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL_A, 'PseudoExistantE2E');

    // Second compte, dans un nouveau contexte pour ne pas partager le cookie.
    const contextB = await page.context().browser()!.newContext();
    await contextB.addInitScript(() => {
      try { localStorage.setItem('lang', 'fr'); } catch { /* ignore */ }
    });
    const pageB = await contextB.newPage();
    await linkAccount(pageB, api, EMAIL_B, 'AutrePseudoE2E');

    await pageB.goto('/profile');
    await pageB.getByPlaceholder('Ton pseudo').fill('PseudoExistantE2E');
    await pageB.getByRole('button', { name: 'Changer' }).click();

    await expect(pageB.getByText('Ce pseudo est déjà pris.')).toBeVisible();

    await contextB.close();
  });

  test('redirige un guest vers /login', async ({ page, api }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login$/);
  });
});

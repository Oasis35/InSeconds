import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { linkAccount } from '../pages/login.page';

const EMAIL_A = 'profile-a@e2e.test';
const EMAIL_B = 'profile-b@e2e.test';

test.describe('Profil', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test("l'onglet « Profil » de la barre du bas (compte connecté) mène au profil", async ({ page, api }) => {
    await linkAccount(page, api, EMAIL_A, 'AvatarUserE2E');

    await page.goto('/');
    await page.getByTestId('tab-account').click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('la barre du bas disparaît pendant la manche', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL_A, 'MancheUserE2E');
    const game = new GamePage(page);

    await game.openWithFakeClock();
    await expect(page.getByTestId('tab-account')).toBeVisible();

    // En pleine manche, un toucher par erreur ouvrirait la confirmation de sortie : ni barre ni accès de l'en-tête (#318).
    await game.clickStart();
    await expect(page.getByText('Piste 1 / 5')).toBeVisible();
    await expect(page.getByTestId('bottom-bar')).toHaveCount(0);
    await expect(page.locator('app-account-link a')).toHaveCount(0);
  });

  test('la langue se change dans le profil', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL_A, 'LangueUserE2E');

    await page.goto('/profile');
    await page.getByTestId('language-en').click();

    await expect(page.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  });

  test('change de pseudo avec succès', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL_A, 'AncienPseudoE2E');

    await page.goto('/profile');

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

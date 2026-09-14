import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { linkAccount, pathOf } from '../pages/login.page';

const EMAIL_A = 'change-email-a@e2e.test';
const EMAIL_B = 'change-email-b@e2e.test';
const NEW_EMAIL = 'nouvel-email@e2e.test';

test.describe('Changement d\'email', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('parcours complet : demande -> confirmation -> email mis à jour sur /profile', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL_A, 'ChangeEmailUserE2E');

    const game = new GamePage(page);
    await game.waitForWelcome();
    await page.goto('/profile');

    await page.getByPlaceholder('ton@email.com').fill(NEW_EMAIL);
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(page.getByText(`Vérifie ta boîte mail à ${NEW_EMAIL}`)).toBeVisible();

    const confirmUrl = await api.getLastEmailChangeLinkUrl(NEW_EMAIL);
    await page.goto(pathOf(confirmUrl));
    await page.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByText(`Adresse confirmée : ${NEW_EMAIL}`)).toBeVisible();

    await page.goto('/profile');
    await expect(page.getByPlaceholder('ton@email.com')).toHaveValue(NEW_EMAIL);
  });

  test('refuse une adresse déjà prise par un autre compte', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL_A, 'ChangeEmailUserAE2E');

    const contextB = await page.context().browser()!.newContext();
    await contextB.addInitScript(() => {
      try { localStorage.setItem('lang', 'fr'); } catch { /* ignore */ }
    });
    const pageB = await contextB.newPage();
    await linkAccount(pageB, api, EMAIL_B, 'ChangeEmailUserBE2E');
    await contextB.close();

    const game = new GamePage(page);
    await game.waitForWelcome();
    await page.goto('/profile');

    await page.getByPlaceholder('ton@email.com').fill(EMAIL_B);
    await page.getByRole('button', { name: 'Envoyer' }).click();

    await expect(page.getByText('Cette adresse est déjà utilisée par un autre compte.')).toBeVisible();
  });

  test('lien invalide affiche une erreur avec un retour vers /profile', async ({ page }) => {
    await page.goto('/profile/confirm-email?token=un-token-qui-nexiste-pas');
    await page.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByText('Ce lien est invalide ou a expiré.')).toBeVisible();
    await page.getByRole('link', { name: '← Retour au profil' }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });
});

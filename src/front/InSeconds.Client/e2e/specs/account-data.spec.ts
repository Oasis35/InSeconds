import { readFile } from 'node:fs/promises';
import { test, expect } from '../fixtures/test';
import { linkAccount } from '../pages/login.page';

// Droits RGPD depuis le profil : copie de ses données en JSON, suppression du compte par une fenêtre où l'on
// retape son pseudo.

const EMAIL = 'donnees@e2e.test';
const PSEUDO = 'DonneesE2E';

test.describe('Tes données', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('« Télécharger mes données » enregistre un JSON avec le compte, sans fenêtre', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL, PSEUDO);
    await page.goto('/profile');

    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger mes données' }).click();
    const download = await downloading;

    expect(download.suggestedFilename()).toMatch(/^inseconds-donnees-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(data.account).toMatchObject({ email: EMAIL, pseudo: PSEUDO });
    expect(data.devices).toHaveLength(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('« Supprimer mon compte » demande le pseudo, supprime le compte et revient au jeu', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL, PSEUDO);
    await page.goto('/profile');

    await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Supprimer ton compte ?' })).toBeVisible();
    const remove = dialog.getByRole('button', { name: 'Supprimer', exact: true });
    await expect(remove).toBeDisabled();

    await dialog.getByLabel(`Retape ton pseudo ${PSEUDO} pour confirmer`).fill(PSEUDO.toLowerCase());
    await remove.click();

    await expect(page).toHaveURL(/\/daily$/);
    await expect(page.getByText('Ton compte est supprimé.')).toBeVisible();
    await expect(page.locator('app-account-link').getByTitle(PSEUDO)).toHaveCount(0);

    // Le compte n'existe plus : le profil renvoie vers la connexion, et l'adresse redemande un pseudo.
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/account\/login$/);
    await linkAccount(page, api, EMAIL, PSEUDO);
  });

  test('« Annuler » ne supprime rien', async ({ page, api }) => {
    await linkAccount(page, api, EMAIL, PSEUDO);
    await page.goto('/profile');

    await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('#profile-pseudo')).toHaveValue(PSEUDO);
  });
});

import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { linkAccount, openOtherDevice, signInAgain } from '../pages/login.page';

// Appareils connectés : chaque connexion par lien magique est un appareil du compte, déconnectable
// depuis le profil. Deux contextes de navigateur = deux appareils.

const EMAIL = 'appareils@e2e.test';
const PSEUDO = 'AppareilsE2E';

function deviceRows(page: Page) {
  return page.getByTestId('device-list').getByRole('listitem');
}

/** La liste est repliée à chaque visite du profil (choix de Clément du 17/10) : un toucher la déplie. */
async function openDeviceList(page: Page): Promise<void> {
  await page.getByTestId('devices-toggle').click();
  await expect(page.getByTestId('device-list')).toBeVisible();
}

function confirmDialogButton(page: Page, name: string) {
  return page.locator('app-confirm-dialog').getByRole('button', { name, exact: true });
}

/** Le second appareil n'est plus connecté : le profil le renvoie vers la connexion. */
async function expectSignedOut(page: Page): Promise<void> {
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/account\/login$/);
}

test.describe('Appareils connectés', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('le profil liste les appareils du compte et déconnecte un autre appareil', async ({ page, api, browser }) => {
    await linkAccount(page, api, EMAIL, PSEUDO);
    const other = await openOtherDevice(browser);
    await signInAgain(other, api, EMAIL, PSEUDO);

    await page.goto('/profile');
    await expect(page.getByTestId('devices-summary')).toHaveText(/et 1 autre/);
    await expect(page.getByTestId('device-list')).toBeHidden();
    await openDeviceList(page);
    await expect(deviceRows(page)).toHaveCount(2);
    await expect(deviceRows(page).filter({ hasText: 'Cet appareil' })).toHaveCount(1);

    const otherRow = deviceRows(page).filter({ hasNotText: 'Cet appareil' });
    await otherRow.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Déconnecter cet appareil ?' })).toBeVisible();
    await confirmDialogButton(page, 'Déconnecter').click();

    await expect(page.getByText('Appareil déconnecté.')).toBeVisible();
    await expect(deviceRows(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Déconnecter les autres appareils' })).toBeHidden();

    // L'autre appareil est refusé dès sa requête suivante ; celui-ci reste connecté.
    await expectSignedOut(other);
    await page.reload();
    await openDeviceList(page);
    await expect(deviceRows(page)).toHaveCount(1);

    await other.context().close();
  });

  test('« Déconnecter les autres appareils » ne garde que l\'appareil courant', async ({ page, api, browser }) => {
    await linkAccount(page, api, EMAIL, PSEUDO);
    const other = await openOtherDevice(browser);
    await signInAgain(other, api, EMAIL, PSEUDO);

    // Depuis le second appareil cette fois : c'est le premier qui doit être déconnecté.
    // Le bouton se voit sans déplier la liste.
    await other.goto('/profile');
    await other.getByRole('button', { name: 'Déconnecter les autres appareils' }).click();
    await expect(other.getByRole('heading', { name: 'Déconnecter les autres appareils ?' })).toBeVisible();
    await confirmDialogButton(other, 'Déconnecter les autres appareils').click();

    await expect(other.getByText('Les autres appareils sont déconnectés.')).toBeVisible();
    await openDeviceList(other);
    await expect(deviceRows(other)).toHaveCount(1);
    await expect(deviceRows(other)).toContainText('Cet appareil');

    await expectSignedOut(page);
    await other.reload();
    await openDeviceList(other);
    await expect(deviceRows(other)).toHaveCount(1);

    await other.context().close();
  });
});

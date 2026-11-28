import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';
import { linkAccount } from '../pages/login.page';

test.describe('Admin - joueurs', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('liste les comptes inscrits et déplie l\'historique d\'un joueur', async ({ page, api }) => {
    await page.clock.install({ time: Date.now() });

    // Compte lié (magic link) qui termine le défi du jour. `linkAccount` attend l'avatar de l'en-tête : la connexion est finie
    // côté serveur avant que la navigation de playFullGame n'annule la requête de vérification en vol.
    const email = 'joueurs-tab@e2e.test';
    await linkAccount(page, api, email, 'JoueurTab');
    await new GamePage(page).playFullGame(new BlindRoundPage(page));

    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await admin.clickTab('Joueurs');

    const row = page.getByTestId('registered-player').filter({ hasText: 'JoueurTab' });
    // L'email est masqué jusqu'au clic (RGPD).
    await expect(row).toContainText('j•••@e2e.test');
    await expect(row).not.toContainText(email);
    await row.getByTestId('player-email').click();
    await expect(row).toContainText(email);
    // login-as-admin ne promeut pas le compte du navigateur (déjà lié), il connecte le compte
    // AdminE2E, qui apparaît aussi dans la liste ; le badge « Admin » est donc sur lui, pas sur JoueurTab.
    await expect(row.getByText('Admin', { exact: true })).toBeHidden();
    await expect(page.getByTestId('registered-player').filter({ hasText: 'AdminE2E' }).getByText('Admin', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: /JoueurTab/ }).click();
    const history = page.getByTestId('player-history');
    await expect(history).toContainText('Terminée');

    // Re-cliquer replie la ligne.
    await row.getByRole('button', { name: /JoueurTab/ }).click();
    await expect(history).not.toBeVisible();
  });

  test('ouvre l\'accès au mode Survie d\'un compte, gardé au rechargement', async ({ page, api }) => {
    await linkAccount(page, api, 'acces-run@e2e.test', 'JoueurRun');

    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await admin.clickTab('Joueurs');

    const toggle = page.getByTestId('registered-player').filter({ hasText: 'JoueurRun' }).getByTestId('run-access');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    // Le client du mode Run est fourni par les routes de l'admin : la requête part bien vers l'API.
    const granted = page.waitForResponse(r => /\/api\/admin\/runs\/access\//.test(r.url()) && r.request().method() === 'PUT');
    await toggle.click();
    expect((await granted).status()).toBe(204);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await page.reload();
    await expect(page.getByTestId('registered-player').filter({ hasText: 'JoueurRun' }).getByTestId('run-access')).toHaveAttribute('aria-checked', 'true');
  });
});

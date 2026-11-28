import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';
import { linkAccount } from '../pages/login.page';

test.describe('Admin - login', () => {
  test('visiteur non connecté : /admin invite à se connecter', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await expect(admin.notLoggedInMessage).toBeVisible();
    // On vise le lien de l'écran d'accès (l'admin n'affiche pas l'en-tête global).
    await expect(page.getByTestId('admin-gate').getByRole('link', { name: /Se connecter/ })).toBeVisible();
  });

  test('compte lié mais pas admin : /admin affiche accès refusé', async ({ page, api }) => {
    await api.reset();
    // La connexion se vérifie par l'avatar de l'en-tête.
    await linkAccount(page, api, 'joueur-normal@e2e.test', 'JoueurE2E');

    const admin = new AdminPage(page);
    await admin.goto();
    await expect(admin.accessDeniedMessage).toBeVisible();
  });

  test('se connecte et affiche l\'accueil directement', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(admin.tab('Accueil')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('day-card')).toBeVisible();
    await expect(admin.logoutButton).toBeVisible();
  });

  test('se déconnecte', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await admin.logoutButton.click();
    await expect(admin.notLoggedInMessage).toBeVisible();
  });
});

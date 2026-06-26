import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';

test.describe('Admin — login', () => {
  test('affiche une erreur avec un mauvais mot de passe', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.passwordInput.fill('mauvais-mdp');
    await admin.loginButton.click();
    await expect(admin.loginError).toBeVisible();
  });

  test('se connecte et affiche le dashboard', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await expect(admin.tab('Dashboard')).toBeVisible();
    await expect(admin.logoutButton).toBeVisible();
  });

  test('se déconnecte', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await admin.logoutButton.click();
    await expect(admin.loginButton).toBeVisible();
  });
});

test.describe('Admin — pool', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('affiche le tableau avec tous les morceaux', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();
    // En-têtes du tableau
    await expect(page.getByRole('columnheader', { name: 'Artiste' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Titre' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Preview' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Statut' })).toBeVisible();
  });

  test('filtre par texte sur artiste', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();
    await admin.poolSearchInput().fill('Eminem');
    await expect(page.getByRole('cell', { name: 'Eminem' })).toBeVisible();
    // Les autres artistes ne doivent pas apparaître
    await expect(page.getByRole('cell', { name: 'Coldplay' })).not.toBeVisible();
  });

  test('filtre preview "Manquante" affiche les 5 morceaux sans preview', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();
    await admin.poolFilterPreview().selectOption('missing');
    // 5 morceaux sans preview dans le seed
    await expect(page.getByRole('cell', { name: 'Manquante' })).toHaveCount(5);
    await expect(page.getByRole('button', { name: '↻ Actualiser' })).toHaveCount(5);
  });

  test('filtre statut "Disponible" masque les morceaux utilisés', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();
    await admin.poolFilterStatus().selectOption('available');
    await expect(page.getByRole('cell', { name: 'Utilisé' })).not.toBeVisible();
    await expect(page.getByRole('cell', { name: 'Disponible' }).first()).toBeVisible();
  });

  test('ajoute un morceau via la modale', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();
    await admin.addButton().click();

    // Cherche dans la modale
    const modalSearch = page.getByPlaceholder('Rechercher artiste ou titre...').last();
    await modalSearch.fill('E2E Track');
    // FakeDeezerHandler retourne "E2E Track" — attendre le résultat (debounce 300ms + réseau)
    const result = page.getByText('E2E Artist — E2E Track');
    await expect(result).toBeVisible({ timeout: 10000 });
    await result.click();
    await admin.modalAddAndCloseButton().click();

    // La modale se ferme et le pool est rechargé
    await expect(page.getByText('Confirmer la suppression')).not.toBeVisible();
  });

  test('supprime un morceau individuel avec confirmation', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();

    // Filtre sur un morceau disponible connu
    await admin.poolSearchInput().fill('Sabrina Carpenter');
    await expect(page.getByRole('cell', { name: 'Sabrina Carpenter' })).toBeVisible();

    // Clique sur la corbeille
    await page.getByRole('button', { name: '🗑' }).first().click();
    await expect(admin.deleteModal()).toBeVisible();
    await expect(page.getByText('Sabrina Carpenter — Espresso')).toBeVisible();

    await admin.confirmDeleteButton().click();
    await expect(admin.deleteModal()).not.toBeVisible();

    // Le morceau a disparu
    await expect(page.getByRole('cell', { name: 'Sabrina Carpenter' })).not.toBeVisible();
  });

  test('annule une suppression', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();

    await admin.poolSearchInput().fill('Sabrina Carpenter');
    await page.getByRole('button', { name: '🗑' }).first().click();
    await expect(admin.deleteModal()).toBeVisible();

    await admin.cancelDeleteButton().click();
    await expect(admin.deleteModal()).not.toBeVisible();
    // Le morceau est toujours là
    await expect(page.getByRole('cell', { name: 'Sabrina Carpenter' })).toBeVisible();
  });

  test('actualise un morceau sans preview — modale pré-remplie', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();

    // Filtre sur les manquantes
    await admin.poolFilterPreview().selectOption('missing');
    await expect(page.getByRole('button', { name: '↻ Actualiser' }).first()).toBeVisible();

    await page.getByRole('button', { name: '↻ Actualiser' }).first().click();

    // La modale s'ouvre avec le champ de recherche pré-rempli
    const modalSearch = page.getByPlaceholder('Rechercher artiste ou titre...').last();
    await expect(modalSearch).not.toHaveValue('');
  });
});

test.describe('Admin — actions', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('génère le défi du jour', async ({ page, api }) => {
    const admin = new AdminPage(page);
    // Supprime le défi du jour pour pouvoir le régénérer
    await admin.apiDeleteTodayChallenge();
    await admin.goto();
    await admin.login();
    await admin.clickTab('Actions');

    await admin.generateButton().click();
    await expect(page.getByText('Défi généré avec succès')).toBeVisible({ timeout: 10000 });
  });

  test('affiche "déjà généré" si le défi existe', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await admin.clickTab('Actions');

    await admin.generateButton().click();
    await expect(page.getByText('déjà généré')).toBeVisible({ timeout: 5000 });
  });

  test('réinitialise les parties du jour', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await admin.clickTab('Actions');

    await admin.resetButton().click();
    await expect(page.getByText(/partie\(s\) supprimée\(s\)/)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Admin — défis', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('liste les défis existants', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    // 3 défis dans le seed (J-2, J-1, aujourd'hui) — tous dans le mois courant
    await page.getByRole('button', { name: /Défis/ }).click();
    // S'assurer d'être sur le mois courant (au cas où le navigateur serait sur un autre mois)
    const now = new Date();
    const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const currentMonth = `${monthNames[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
    await expect(page.getByText(currentMonth)).toBeVisible();
    const rows = page.locator('ul > li > p.font-mono');
    await expect(rows).toHaveCount(3);
  });
});

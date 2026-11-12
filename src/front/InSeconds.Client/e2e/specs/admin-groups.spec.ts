import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';

// L'onglet « Groupes » de l'admin : la modération des groupes de Setlist (renommer, remettre un nom à zéro, supprimer). Le groupe est créé par
// l'API des joueurs, avec le compte admin des tests (un compte comme un autre).

test.describe('Admin - groupes', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('un groupe se renomme, se remet à zéro puis se supprime', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const created = await page.request.post('/api/social/groups', { data: { name: 'Les copains' } });
    expect(created.ok(), 'création du groupe').toBe(true);

    await admin.clickTab('Groupes');
    await expect(page).toHaveURL(/\/admin\/groupes/);
    const row = page.getByTestId('admin-group');
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('admin-group-name')).toHaveText('Les copains');

    // Renommer sur place.
    await row.getByTestId('rename-group').click();
    await row.locator('input').fill('Les amis');
    await row.locator('input').press('Enter');
    await expect(row.getByTestId('admin-group-name')).toHaveText('Les amis');

    // Remettre le nom à zéro : un nom neutre, après confirmation.
    await row.getByTestId('reset-group-name').click();
    await row.getByTestId('confirm-reset').click();
    await expect(row.getByTestId('admin-group-name')).toHaveText(/^Groupe \d+$/);

    // Supprimer, après confirmation : la liste est vide.
    await row.getByTestId('delete-group').click();
    await row.getByTestId('confirm-delete').click();
    await expect(page.getByTestId('admin-group')).toHaveCount(0);
  });
});

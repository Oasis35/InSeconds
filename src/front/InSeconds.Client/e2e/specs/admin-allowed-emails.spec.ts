import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';

test.describe('Admin — emails autorisés', () => {
  test.beforeEach(async ({ api, page }) => {
    await api.reseed();
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Emails autorisés/ }).click();
  });

  test("ajouter un email l'affiche en attente", async ({ page }) => {
    await page.getByPlaceholder('email@exemple.com').fill('nouveau@e2e.test');
    await page.getByRole('button', { name: 'Autoriser' }).click();

    const row = page.getByRole('row').filter({ hasText: 'nouveau@e2e.test' });
    await expect(row).toBeVisible();
    await expect(row.getByText('En attente')).toBeVisible();
  });

  test('ajouter un email déjà présent affiche une erreur, pas de doublon', async ({ page }) => {
    // La whitelist e2e est pré-remplie avec allowed@e2e.test (ResetEndpoint.SeedData).
    await page.getByPlaceholder('email@exemple.com').fill('allowed@e2e.test');
    await page.getByRole('button', { name: 'Autoriser' }).click();

    await expect(page.getByText('Cet email est déjà autorisé.')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'allowed@e2e.test' })).toHaveCount(1);
  });

  test('supprimer un email le retire de la liste', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'allowed@e2e.test' });
    await row.getByRole('button', { name: 'Retirer' }).click();

    await expect(page.getByText('Retirer cet email ?')).toBeVisible();
    // Deux boutons "Retirer" sont visibles pendant la confirmation (celui de la ligne,
    // masqué derrière l'overlay, et celui de la modale) : la modale est ajoutée après
    // le tableau dans le DOM, donc `.last()` cible le bouton de confirmation.
    await page.getByRole('button', { name: 'Retirer' }).last().click();

    await expect(page.getByRole('row').filter({ hasText: 'allowed@e2e.test' })).toHaveCount(0);
  });

  test('annuler la suppression garde l\'email dans la liste', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'allowed@e2e.test' });
    await row.getByRole('button', { name: 'Retirer' }).click();
    await page.getByRole('button', { name: 'Annuler' }).click();

    await expect(page.getByRole('row').filter({ hasText: 'allowed@e2e.test' })).toBeVisible();
  });

  test('un email lié à un compte affiche le badge "Compte actif"', async ({ page, api, context }) => {
    // Lie allowed@e2e.test à un compte via le vrai flow magic link, dans un onglet
    // séparé pour ne pas perdre la session admin de la page courante.
    const playerPage = await context.newPage();
    await playerPage.goto('/login');
    await playerPage.getByPlaceholder('ton@email.com').fill('allowed@e2e.test');
    await playerPage.getByRole('button', { name: 'Recevoir un lien' }).click();
    // Attendre la confirmation avant de lire le lien : sinon race condition, le clic
    // (POST /api/auth/magic-link/request) peut ne pas être encore traité côté serveur
    // (cf. TestEmailCapture) quand getLastMagicLinkUrl interroge — même pattern que
    // requestMagicLink() dans login.spec.ts.
    await playerPage.getByText('un lien de connexion vient de lui être envoyé').waitFor();

    const linkUrl = await api.getLastMagicLinkUrl('allowed@e2e.test');
    const { pathname, search } = new URL(linkUrl);
    await playerPage.goto(pathname + search);
    await playerPage.getByRole('button', { name: 'Confirmer la connexion' }).click();
    await playerPage.getByPlaceholder('Ton pseudo').fill('DianeE2E');
    await playerPage.getByRole('button', { name: 'Valider' }).click();
    await playerPage.close();

    await page.reload();
    await page.getByRole('button', { name: /Emails autorisés/ }).click();

    const row = page.getByRole('row').filter({ hasText: 'allowed@e2e.test' });
    await expect(row.getByText('Compte actif')).toBeVisible();
  });
});

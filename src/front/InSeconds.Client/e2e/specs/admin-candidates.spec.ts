import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';
import type { Page } from '@playwright/test';

// Le sas « À valider » (onglet Contenu) : l'admin colle des identifiants Deezer, ils sont lus tout de suite par le faux Deezer, puis il écoute, coche et
// ajoute au pool. Rien n'entre dans le pool sans ce clic. Identifiants du faux Deezer : 6 000 001 et suivants (connus, avec extrait, absents du seed),
// 9 000 000 101 (connu, sans extrait, absent du seed), 8 000 000 001 (inconnu de Deezer).

async function openCandidates(page: Page): Promise<AdminPage> {
  const admin = new AdminPage(page);
  await admin.goto();
  await admin.login();
  // Adresse directe : le premier chargement d'une page paresseuse sur un serveur de développement froid peut recharger la page en route.
  await page.goto('/admin/a-valider');
  await expect(page.getByTestId('candidates-text')).toBeVisible({ timeout: 30_000 });
  return admin;
}

async function importIds(page: Page, text: string): Promise<void> {
  await page.getByTestId('candidates-text').fill(text);
  await page.getByTestId('candidates-import').click();
}

const rows = (page: Page) => page.getByTestId('candidate');
const rowOf = (page: Page, text: string) => rows(page).filter({ hasText: text });

test.describe('Admin - sas À valider', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('importe des identifiants avec leur priorité et les lit chez Deezer sans rien ajouter au pool', async ({ page }) => {
    await openCandidates(page);
    const before = ((await (await page.request.get('/api/admin/catalogue/tracks')).json()) as unknown[]).length;

    await importIds(page, '6000001 A\n6000002 B\n6000003');

    await expect(page.getByTestId('candidates-import-result')).toContainText('3');
    await expect(rows(page)).toHaveCount(3);
    await expect(rowOf(page, 'E2E Track 6000001')).toBeVisible();
    // A d'abord, B ensuite, sans priorité à la fin.
    await expect(rows(page).first()).toContainText('E2E Track 6000001');
    await expect(rows(page).last()).toContainText('E2E Track 6000003');
    await expect(rowOf(page, 'E2E Track 6000001').getByTestId('candidate-priority')).toHaveText('A');
    const after = ((await (await page.request.get('/api/admin/catalogue/tracks')).json()) as unknown[]).length;
    expect(after).toBe(before);
  });

  test('dit ce qui ne se peut pas : pas d\'extrait, inconnu de Deezer, déjà dans la liste', async ({ page }) => {
    await openCandidates(page);

    await importIds(page, '9000000101\n8000000001\n6000001');
    await expect(rows(page)).toHaveCount(3);
    await expect(rowOf(page, '9000000101')).toContainText('Pas d\'extrait');
    await expect(rowOf(page, '8000000001')).toContainText('Introuvable');
    await expect(rowOf(page, '9000000101').getByTestId('candidate-check')).toBeDisabled();

    await importIds(page, '6000001');
    await expect(page.getByTestId('candidates-import-result')).toContainText('1 déjà dans la liste');
  });

  test('écoute un candidat, puis ajoute la sélection au pool : le morceau quitte le sas', async ({ page }) => {
    await openCandidates(page);
    await importIds(page, '6000001 A\n6000002 B');
    await expect(rows(page)).toHaveCount(2);

    // Le ▶ est à gauche de la ligne et ouvre la fenêtre d'écoute.
    await rowOf(page, 'E2E Track 6000001').getByTestId('candidate-listen').click();
    await expect(page.getByRole('dialog')).toContainText('E2E Track 6000001');
    await page.keyboard.press('Escape');

    await rowOf(page, 'E2E Track 6000001').getByTestId('candidate-check').check();
    await page.getByTestId('candidates-add').click();
    await expect(page.getByTestId('candidates-add-result')).toBeVisible();

    await expect(rows(page)).toHaveCount(1);
    await expect(rowOf(page, 'E2E Track 6000002')).toBeVisible();
    await expect.poll(async () => {
      const tracks = (await (await page.request.get('/api/admin/catalogue/tracks')).json()) as { deezerTrackId: number }[];
      return tracks.some(t => t.deezerTrackId === 6000001);
    }).toBe(true);
    // Le morceau ajouté est dans le pool, l'autre pas.
    const tracks = (await (await page.request.get('/api/admin/catalogue/tracks')).json()) as { deezerTrackId: number }[];
    expect(tracks.some(t => t.deezerTrackId === 6000002)).toBe(false);
  });

  test('écarte un candidat, le retrouve dans les écartés, le remet ; un nouvel import ne le ressuscite pas', async ({ page }) => {
    await openCandidates(page);
    await importIds(page, '6000001\n6000002');
    await expect(rows(page)).toHaveCount(2);

    await rowOf(page, 'E2E Track 6000002').getByTestId('candidate-check').check();
    await page.getByTestId('candidates-dismiss').click();
    await expect(rows(page)).toHaveCount(1);

    await importIds(page, '6000002');
    await expect(page.getByTestId('candidates-import-result')).toContainText('1 déjà dans la liste');
    await expect(rows(page)).toHaveCount(1);

    await page.getByTestId('candidates-view-dismissed').click();
    await expect(rows(page)).toHaveCount(1);
    await rowOf(page, 'E2E Track 6000002').getByTestId('candidate-check').check();
    await page.getByTestId('candidates-restore').click();
    await expect(page.getByTestId('candidates-empty')).toBeVisible();

    await page.getByTestId('candidates-view-todo').click();
    await expect(rows(page)).toHaveCount(2);
  });

  test('la barre du contenu relie Morceaux, Thèmes et À valider, l\'onglet Contenu reste allumé', async ({ page }) => {
    const admin = await openCandidates(page);
    const content = page.getByTestId('content-tabs');

    await expect(admin.tab('Contenu')).toHaveAttribute('aria-current', 'page');
    await content.getByRole('link', { name: 'Thèmes' }).click();
    await expect(page).toHaveURL(/\/admin\/themes/);
    await expect(admin.tab('Contenu')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('content-tabs').getByRole('link', { name: 'Morceaux' }).click();
    await expect(page).toHaveURL(/\/admin\/catalogue/);
    await expect(admin.tab('Contenu')).toHaveAttribute('aria-current', 'page');
  });

  test('refuse un import illisible sans rien envoyer', async ({ page }) => {
    await openCandidates(page);

    await page.getByTestId('candidates-text').fill('bonjour');

    await expect(page.getByTestId('candidates-issues')).toBeVisible();
    await expect(page.getByTestId('candidates-import')).toBeDisabled();
  });

  test('une route du sas refuse un joueur sans le rôle admin', async ({ page }) => {
    const res = await page.request.get('/api/admin/catalogue/candidates');

    expect([401, 403]).toContain(res.status());
  });
});

import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';

test.describe('Admin - panneau technique et cooldown', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('le panneau technique montre le déploiement, les tâches de la nuit et la CI, sans onglet Actions', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();

    const panel = admin.techPanel();
    // Build local : aucun commit connu, le verdict le dit.
    await expect(panel.getByTestId('deployment-verdict')).toContainText('Commits inconnus (build local)');
    // Les commits sont repliés sous le verdict, et se déplient au clic.
    await expect(panel.getByTestId('deployment-commits')).toHaveCount(0);
    await panel.getByTestId('deployment-verdict').click();
    await expect(panel.getByTestId('deployment-commits')).toContainText('Front');
    // Les tâches sont en pause dans l'hôte de test : aucune n'a tourné.
    await expect(panel.getByTestId('nightly-job')).toHaveCount(4);
    await expect(panel.getByTestId('nightly-job').first()).toContainText('Extraits');
    await expect(panel.getByRole('link', { name: 'Hangfire' })).toHaveAttribute('href', /\/jobs$/);
    await expect(panel.getByTestId('ci-line')).toHaveCount(2);
    await expect(admin.tab('Actions')).toHaveCount(0);
  });

  test('le panneau technique montre l\'état du catalogue et le défi de demain ; Morceaux trie les moins trouvés', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();

    const panel = admin.techPanel();
    await expect(panel.getByTestId('tech-catalogue')).toContainText('Sans extrait');
    await expect(panel.getByTestId('tech-catalogue')).toContainText("Sans forme d'onde");
    // Le pool des E2E a 50 morceaux jouables et 7 jours de cooldown : le défi de demain a de quoi être tiré.
    await expect(panel.getByTestId('next-challenge')).toContainText(/Demain\s*prêt · \d+ tirables/);

    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await page.getByTestId('sort-hardest').click();
    await expect(page.getByTestId('sort-hardest')).toHaveAttribute('aria-pressed', 'true');
    await expect(admin.poolColumnHeader('Trouvé')).toHaveAttribute('aria-sort', 'ascending');
  });

  test('édite le cooldown de réutilisation depuis l\'onglet Morceaux et persiste en base', async ({ page }) => {
    const adminPage = new AdminPage(page);
    await adminPage.goto();
    await adminPage.login();
    await adminPage.clickTab('Morceaux');

    // La part du catalogue en cooldown (#275). Queen (LastUsedDate = today-5j) a une date de déblocage lue en base au chargement du pool
    // (pas via /api/settings, figé au boot) - sert de preuve que le nouveau cooldown est bien pris
    // en compte, cohérent avec "effectif au prochain calcul", pas de redémarrage requis.
    const before = await adminPage.apiGetPoolUnlockDate(5055001); // Queen - Bohemian Rhapsody

    // 75 % de 50 morceaux jouables, 5 par défi : 7 jours, sous le seuil de 14 jours (la ligne repliée le montre déjà).
    await expect(adminPage.cooldownSetting().getByTestId('cooldown-days')).toHaveText('7 j');
    await adminPage.openCooldownSetting();
    await expect(adminPage.trackCooldownInput()).toHaveValue('75');
    await expect(page.getByText('Appliqué aujourd\'hui : 7 jours · 50 morceaux jouables')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Sous le seuil de 14 jours' })).toBeVisible();

    await adminPage.trackCooldownInput().fill('45');
    await adminPage.cooldownSetting().getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Cooldown mis à jour.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Appliqué aujourd\'hui : 4 jours · 50 morceaux jouables')).toBeVisible();
    await expect(adminPage.cooldownSetting().getByTestId('cooldown-days')).toHaveText('4 j');

    await expect.poll(() => adminPage.apiGetPoolUnlockDate(5055001)).not.toBe(before);
  });

  test('les anciennes adresses de l\'onglet Actions mènent aux Morceaux', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();

    await page.goto('/admin/actions');
    await expect(page).toHaveURL(/\/admin\/catalogue$/);
  });
});

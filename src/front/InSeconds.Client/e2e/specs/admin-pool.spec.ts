import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';

test.describe('Admin - pool', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('affiche le tableau avec tous les morceaux', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    // En-têtes du tableau
    await expect(page.getByRole('columnheader', { name: 'Artiste' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Titre' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Preview' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Statut' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Joué par' })).toBeVisible();
    // Le pool général est celui de tous les modes : aucune colonne propre au Daily.
    await expect(page.getByRole('columnheader', { name: /Dernière utilisation/ })).toHaveCount(0);
  });

  test('filtre par texte sur artiste', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await admin.poolSearchInput().fill('Eminem');
    await expect(page.getByRole('cell', { name: 'Eminem', exact: true })).toBeVisible();
    // Les autres artistes ne doivent pas apparaître
    await expect(page.getByRole('cell', { name: 'Coldplay', exact: true })).not.toBeVisible();
  });

  test('filtre preview "Manquante" affiche les 5 morceaux sans preview', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await admin.poolFilterPreview().selectOption('missing');
    // 5 morceaux sans preview dans le seed
    await expect(page.getByRole('cell', { name: 'Manquante' })).toHaveCount(5);
  });

  test('pool général : colonne Genre (celui de l\'album) et filtre par genre', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Genre' })).toBeVisible();

    // Le seed range les morceaux sous les albums du faux Deezer : Pop, Rap/Hip Hop et Dance, Rock, ou aucun genre.
    await admin.poolFilterGenre().selectOption({ label: 'Rock' });

    await expect(page.getByTestId('genres').first()).toHaveText('Rock');
    const genres = await page.getByTestId('genres').allTextContents();
    expect(genres.length).toBeGreaterThan(0);
    expect(genres.every(genre => genre.includes('Rock'))).toBe(true);
  });

  test('filtres alignés sur les colonnes : « Disponible » du pool général, vue Daily sans Preview ni Statut', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();

    // Pool général : « Disponible » écarte les morceaux utilisés (Coldplay est dans un défi du seed), garde les autres.
    await admin.poolFilterStatus().selectOption('available');
    await admin.poolSearchInput().fill('Coldplay');
    await expect(admin.poolRow('Coldplay')).not.toBeVisible();
    await admin.poolSearchInput().fill('Michael Jackson');
    await expect(admin.poolRow('Michael Jackson')).toBeVisible();

    // Vue Daily : ni colonne ni filtre Preview, Statut ou Genre ; la recherche et les dates de dernière utilisation restent.
    await admin.poolView('Daily').click();
    await expect(page.getByRole('columnheader', { name: 'Statut' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Preview' })).toHaveCount(0);
    await expect(admin.poolFilterStatus()).toHaveCount(0);
    await expect(admin.poolFilterPreview()).toHaveCount(0);
    await expect(admin.poolFilterGenre()).toHaveCount(0);
    await expect(page.locator('#pool-filter-lastused-from')).toBeVisible();
  });

  test('la vue du pool est dans l\'adresse : ?view=daily se rouvre au rechargement', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await expect(page).not.toHaveURL(/view=/);

    await admin.poolView('Daily').click();
    await expect(page).toHaveURL(/view=daily/);
    await page.reload();

    await expect(admin.poolView('Daily')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('columnheader', { name: 'Dernière utilisation' })).toBeVisible();
    await admin.poolView('Pool').click();
    await expect(page).not.toHaveURL(/view=/);
  });

  test('pool général : « Joué par » ne garde que les morceaux d\'un mode, ou aucun', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();

    // Coldplay est dans un défi du seed, Michael Jackson n'a jamais été joué. Le texte cherché restreint la grille
    // (paginée par 15) au morceau regardé : le filtre « Joué par » s'y combine.
    await admin.poolFilterPlayedBy().selectOption({ label: 'Joué par Daily' });
    await admin.poolSearchInput().fill('Coldplay');
    await expect(admin.poolRow('Coldplay')).toBeVisible();
    await expect(admin.poolRow('Coldplay').getByTestId('usage-badge')).toHaveText('Daily');
    await admin.poolSearchInput().fill('Michael Jackson');
    await expect(admin.poolRow('Michael Jackson')).not.toBeVisible();

    await admin.poolFilterPlayedBy().selectOption({ label: 'Joué par : aucun mode' });
    await expect(admin.poolRow('Michael Jackson')).toBeVisible();
    await admin.poolSearchInput().fill('Coldplay');
    await expect(admin.poolRow('Coldplay')).not.toBeVisible();
  });

  test('ajoute un morceau via le panneau de recherche', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await admin.addButton().click();

    // Cherche dans le panneau (placeholder distinct du filtre pool)
    await admin.addPanelSearchInput().fill('E2E Track');
    // FakeDeezerHandler retourne "E2E Track" - attendre le résultat (debounce 300ms + réseau)
    const result = page.getByText('E2E Artist - E2E Track');
    await expect(result).toBeVisible({ timeout: 10000 });
    await admin.addPanelAddButton().click();

    // Le tableau du pool est rechargé, le panneau reste ouvert
    await expect(page.getByRole('cell', { name: 'E2E Artist', exact: true })).toBeVisible();
    await expect(admin.addPanelSearchInput()).toBeVisible();
  });

  test('supprime un morceau individuel avec confirmation', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();

    // Filtre sur un morceau disponible connu
    await admin.poolSearchInput().fill('Sabrina Carpenter');
    await expect(page.getByRole('cell', { name: 'Sabrina Carpenter', exact: true })).toBeVisible();

    // Clique sur la corbeille
    await page.getByRole('button', { name: '🗑' }).first().click();
    await expect(admin.deleteModal()).toBeVisible();
    await expect(page.getByText('Sabrina Carpenter - Espresso')).toBeVisible();

    await admin.confirmDeleteButton().click();
    await expect(admin.deleteModal()).not.toBeVisible();

    // Le morceau a disparu
    await expect(page.getByRole('cell', { name: 'Sabrina Carpenter', exact: true })).not.toBeVisible();
  });

  test('annule une suppression', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();

    await admin.poolSearchInput().fill('Sabrina Carpenter');
    await page.getByRole('button', { name: '🗑' }).first().click();
    await expect(admin.deleteModal()).toBeVisible();

    await admin.cancelDeleteButton().click();
    await expect(admin.deleteModal()).not.toBeVisible();
    // Le morceau est toujours là
    await expect(page.getByRole('cell', { name: 'Sabrina Carpenter', exact: true })).toBeVisible();
  });

  test('un morceau déjà utilisé reste sélectionnable mais ne peut pas être supprimé', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();

    // Coldplay - Yellow fait partie du défi J-2 du seed : pas de corbeille, un bouton « Désactiver » à la place.
    await admin.poolSearchInput().fill('Coldplay');
    const row = admin.poolRow('Coldplay');
    await expect(row.getByRole('button', { name: '🗑' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Désactiver' })).toBeEnabled();
    await expect(row.getByRole('button', { name: '▶' })).toBeEnabled();

    await row.getByRole('checkbox').check();
    await expect(page.getByRole('button', { name: 'Supprimer (1)' })).toBeDisabled();
  });

  test('désactive puis réactive un morceau utilisé, bloque ceux du défi du jour', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();

    // Eminem est dans le défi du jour : « Désactiver » grisé.
    await admin.poolSearchInput().fill('Eminem');
    await expect(admin.poolRow('Eminem').getByRole('button', { name: 'Désactiver' })).toBeDisabled();

    // Coldplay (défi J-2) : désactivable, reste dans le pool avec le badge « Désactivé ».
    await admin.poolSearchInput().fill('Coldplay');
    await admin.poolRow('Coldplay').getByRole('button', { name: 'Désactiver' }).click();
    await expect(admin.poolRow('Coldplay').getByRole('button', { name: 'Réactiver' })).toBeVisible();
    await expect(admin.poolRow('Coldplay').getByText('Désactivé', { exact: true })).toBeVisible();

    // Retrouvable via le filtre « Désactivés », qui ne montre que lui.
    await admin.poolSearchInput().fill('');
    await admin.poolFilterStatus().selectOption('disabled');
    await expect(admin.poolRow('Coldplay')).toBeVisible();

    await admin.poolRow('Coldplay').getByRole('button', { name: 'Réactiver' }).click();
    await expect(admin.poolRow('Coldplay')).not.toBeVisible();
    await admin.poolFilterStatus().selectOption('all');
    await admin.poolSearchInput().fill('Coldplay');
    await expect(admin.poolRow('Coldplay').getByRole('button', { name: 'Désactiver' })).toBeEnabled();
  });

  test('renomme un morceau déjà utilisé, défi du jour compris', async ({ page, api }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();

    // Eminem est dans le défi du jour : renommable lui aussi, avec un avertissement.
    await admin.poolSearchInput().fill('Eminem');
    await admin.poolRow('Eminem').getByRole('button', { name: '✎' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'défi du jour' })).toBeVisible();
    await admin.editTitleInput().fill('Titre corrigé');
    await admin.editSaveButton().click();
    await expect(admin.editModalTitle()).not.toBeVisible();
    await expect(page.getByRole('cell', { name: 'Titre corrigé', exact: true })).toBeVisible();

    // Coldplay (défi J-2) : renommable. Échap referme la modale sans rien changer.
    await admin.poolSearchInput().fill('Coldplay');
    await admin.poolRow('Coldplay').getByRole('button', { name: '✎' }).click();
    await expect(admin.editModalTitle()).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'défi du jour' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(admin.editModalTitle()).not.toBeVisible();

    await admin.poolRow('Coldplay').getByRole('button', { name: '✎' }).click();
    await admin.editTitleInput().fill('Yellow (Live)');
    await admin.editSaveButton().click();
    await expect(admin.editModalTitle()).not.toBeVisible();
    await expect(page.getByRole('cell', { name: 'Yellow (Live)', exact: true })).toBeVisible();

    // Remet le seed d'origine pour les specs suivants.
    await api.reseed();
  });

  test('la fenêtre de modification défile quand elle dépasse l\'écran', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await admin.poolSearchInput().fill('Coldplay');
    // Petit écran seulement une fois connecté : en mobile, « Se déconnecter » est replié dans le panneau technique.
    await page.setViewportSize({ width: 375, height: 420 });
    await admin.poolRow('Coldplay').getByRole('button', { name: '✎' }).click();
    await expect(admin.editModalTitle()).toBeVisible();

    // Le conteneur de la fenêtre défile : sa hauteur visible tient dans l'écran, son contenu est plus haut.
    const container = page.locator('.app-modal-panel > .cdk-dialog-container');
    const box = await container.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(420);
    expect(await container.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);

    // Les boutons du bas restent atteignables par le défilement.
    const cancel = page.getByRole('button', { name: 'Annuler' });
    await cancel.scrollIntoViewIfNeeded();
    await cancel.click();
    await expect(admin.editModalTitle()).not.toBeVisible();
  });

  test('vue Daily : affiche les colonnes cooldown avec les bonnes valeurs', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await admin.poolView('Daily').click();

    await expect(admin.poolColumnHeader('Dernière utilisation')).toBeVisible();
    await expect(admin.poolColumnHeader('Date de déblocage')).toBeVisible();
    await expect(admin.poolColumnHeader('Nb. utilisations')).toBeVisible();

    // Colonnes de la vue Daily (en lecture seule, sans case à cocher, sans Preview ni Statut) : 0=Actions, 1=Artiste, 2=Titre,
    // 3=Dernière utilisation, 4=Date de déblocage, 5=Nb. utilisations.
    // Le pool des E2E a 50 morceaux jouables : 75 % du pool, 5 par défi, soit 7 jours de cooldown, sous le seuil d'alerte.
    await expect(page.getByTestId('pool-cooldown')).toHaveText('cooldown 7 j');
    // Queen (index 16 du seed) a été mise en cooldown récent (-5j, 7 j de cooldown) : dates non vides.
    await admin.poolSearchInput().fill('Queen');
    const queenRow = admin.poolRow('Queen');
    await expect(queenRow.getByRole('cell').nth(3)).not.toHaveText('');
    await expect(queenRow.getByRole('cell').nth(4)).not.toHaveText('');

    // Michael Jackson (index 15) n'a jamais été utilisé : date de déblocage vide.
    await admin.poolSearchInput().fill('Michael Jackson');
    const mjRow = admin.poolRow('Michael Jackson');
    await expect(mjRow.getByRole('cell').nth(4)).toHaveText('');
  });

  test('vue Daily : filtre par plage de dates sur la dernière utilisation', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await admin.poolView('Daily').click();

    // Ed Sheeran (index 20, -15j) tombe dans la plage ; Queen (-5j) et Adele (-90j) en dehors.
    const today = new Date();
    const from = new Date(today); from.setUTCDate(from.getUTCDate() - 20);
    const to = new Date(today); to.setUTCDate(to.getUTCDate() - 10);
    await admin.poolFilterLastUsedFrom().fill(from.toISOString().slice(0, 10));
    await admin.poolFilterLastUsedTo().fill(to.toISOString().slice(0, 10));

    await expect(page.getByRole('cell', { name: 'Ed Sheeran', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Queen', exact: true })).not.toBeVisible();
    await expect(page.getByRole('cell', { name: 'Adele', exact: true })).not.toBeVisible();
  });

  test('vue Daily : trie par nombre d\'utilisations', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();
    await admin.poolView('Daily').click();

    // Adele (index 19) a le UsageCount le plus élevé du seed (7) - tri desc doit la faire remonter.
    await admin.poolColumnHeader('Nb. utilisations').click();
    await admin.poolColumnHeader('Nb. utilisations').click(); // 2e clic → desc
    // Colonne Artiste = cell index 1 de la vue Daily (0=Actions, 1=Artiste).
    await expect(page.getByRole('row').nth(1).getByRole('cell').nth(1)).toHaveText('Adele');
  });

  test('le bouton ▶ ouvre la modale d\'écoute de l\'extrait', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('link', { name: 'Contenu', exact: true }).click();

    await page.getByRole('button', { name: '▶', exact: true }).first().click();

    const modal = page.getByRole('dialog').filter({ hasText: 'Écouter l\'extrait' });
    await expect(modal).toBeVisible();
    // FakeDeezerHandler renvoie un extrait → lecteur prêt (bouton lecture/pause).
    await expect(modal.getByTestId('preview-toggle')).toBeVisible();

    await modal.getByRole('button', { name: 'Fermer' }).click();
    await expect(modal).not.toBeVisible();
  });
});

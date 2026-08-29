import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

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

    // Cherche dans la modale (placeholder distinct du filtre pool)
    const modalSearch = page.getByPlaceholder('Rechercher sur Deezer...');
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
    await expect(page.getByRole('cell', { name: 'Sabrina Carpenter', exact: true })).toBeVisible();

    // Clique sur la corbeille
    await page.getByRole('button', { name: '🗑' }).first().click();
    await expect(admin.deleteModal()).toBeVisible();
    await expect(page.getByText('Sabrina Carpenter — Espresso')).toBeVisible();

    await admin.confirmDeleteButton().click();
    await expect(admin.deleteModal()).not.toBeVisible();

    // Le morceau a disparu
    await expect(page.getByRole('cell', { name: 'Sabrina Carpenter', exact: true })).not.toBeVisible();
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
    await expect(page.getByRole('cell', { name: 'Sabrina Carpenter', exact: true })).toBeVisible();
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
    const modalSearch = page.getByPlaceholder('Rechercher sur Deezer...');
    await expect(modalSearch).not.toHaveValue('');
  });

  test('affiche les colonnes cooldown avec les bonnes valeurs', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();

    await expect(admin.poolColumnHeader('Dernière utilisation')).toBeVisible();
    await expect(admin.poolColumnHeader('Date de déblocage')).toBeVisible();
    await expect(admin.poolColumnHeader('Nb. utilisations')).toBeVisible();

    // Colonnes (après réordonnancement) : 0=sélection, 1=Actions, 2=Artiste, 3=Titre,
    // 4=Preview, 5=Statut, 6=Dernière utilisation, 7=Date de déblocage, 8=Nb. utilisations.
    // Queen (index 10 du seed) a été mise en cooldown récent (-5j, defaut 30j) : dates non vides.
    await admin.poolSearchInput().fill('Queen');
    const queenRow = admin.poolRow('Queen');
    await expect(queenRow.getByRole('cell').nth(6)).not.toHaveText('');
    await expect(queenRow.getByRole('cell').nth(7)).not.toHaveText('');

    // Michael Jackson (index 9) n'a jamais été utilisé : date de déblocage vide.
    await admin.poolSearchInput().fill('Michael Jackson');
    const mjRow = admin.poolRow('Michael Jackson');
    await expect(mjRow.getByRole('cell').nth(7)).toHaveText('');
  });

  test('filtre par plage de dates sur la dernière utilisation', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();

    // Ed Sheeran (index 14, -15j) tombe dans la plage ; Queen (-5j) et Adele (-90j) en dehors.
    const today = new Date();
    const from = new Date(today); from.setUTCDate(from.getUTCDate() - 20);
    const to = new Date(today); to.setUTCDate(to.getUTCDate() - 10);
    await admin.poolFilterLastUsedFrom().fill(from.toISOString().slice(0, 10));
    await admin.poolFilterLastUsedTo().fill(to.toISOString().slice(0, 10));

    await expect(page.getByRole('cell', { name: 'Ed Sheeran', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Queen', exact: true })).not.toBeVisible();
    await expect(page.getByRole('cell', { name: 'Adele', exact: true })).not.toBeVisible();
  });

  test('trie par nombre d\'utilisations', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();

    // Adele (index 13) a le UsageCount le plus élevé du seed (7) — tri desc doit la faire remonter.
    await admin.poolColumnHeader('Nb. utilisations').click();
    await admin.poolColumnHeader('Nb. utilisations').click(); // 2e clic → desc
    // Colonne Artiste = cell index 2 (0=sélection, 1=Actions, 2=Artiste).
    await expect(page.getByRole('row').nth(1).getByRole('cell').nth(2)).toHaveText('Adele');
  });

  test('le bouton ▶ ouvre la modale d\'écoute de l\'extrait', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Pool/ }).click();

    await page.getByRole('button', { name: '▶', exact: true }).first().click();

    const modal = page.getByRole('dialog').filter({ hasText: 'Écouter l\'extrait' });
    await expect(modal).toBeVisible();
    // FakeDeezerHandler renvoie un extrait → lecteur prêt (bouton lecture/pause).
    await expect(modal.getByRole('button', { name: /▶|⏸/ })).toBeVisible();

    await modal.getByRole('button', { name: 'Fermer' }).click();
    await expect(modal).not.toBeVisible();
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

  test('édite le cooldown de réutilisation et persiste en base', async ({ page }) => {
    const adminPage = new AdminPage(page);
    await adminPage.goto();
    await adminPage.login();
    await adminPage.clickTab('Actions');

    // Queen (LastUsedDate = today-5j) a une date de déblocage lue en base au chargement du pool
    // (pas via /api/settings, figé au boot) — sert de preuve que le nouveau cooldown est bien pris
    // en compte, cohérent avec "effectif au prochain calcul", pas de redémarrage requis.
    const before = await adminPage.apiGetPoolUnlockDate(5055001); // Queen — Bohemian Rhapsody

    await adminPage.trackCooldownInput().fill('45');
    await adminPage.saveCooldownButton().click();
    await expect(page.getByText('Cooldown mis à jour.')).toBeVisible({ timeout: 5000 });

    await expect.poll(() => adminPage.apiGetPoolUnlockDate(5055001)).not.toBe(before);
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
    // Le seed crée 3 défis (J-2, J-1, aujourd'hui) — mais en début de mois, J-2 et/ou J-1
    // peuvent tomber dans le mois précédent. On compte donc dynamiquement combien tombent
    // dans le mois UTC courant plutôt que de coder en dur "3".
    await page.getByRole('button', { name: /Défis/ }).click();
    const now = new Date();
    const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const currentMonth = `${monthNames[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
    await expect(page.getByText(currentMonth)).toBeVisible();
    const seededDates = [0, 1, 2].map(daysAgo => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
      return d;
    });
    const expectedCount = seededDates.filter(
      d => d.getUTCMonth() === now.getUTCMonth() && d.getUTCFullYear() === now.getUTCFullYear()
    ).length;
    const rows = page.locator('ul > li > p.font-mono');
    await expect(rows).toHaveCount(expectedCount);
  });
});

test.describe('Admin — chargement paresseux par onglet', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('ne charge les données d\'un onglet qu\'à son ouverture', async ({ page }) => {
    const admin = new AdminPage(page);
    const adminCalls: string[] = [];
    page.on('request', req => {
      const u = req.url();
      if (u.includes('/api/admin/')) adminCalls.push(u);
    });

    await admin.goto();
    await admin.login();

    // Dashboard = onglet d'atterrissage → ses stats se chargent...
    await expect.poll(() => adminCalls.some(u => u.includes('/api/admin/stats'))).toBe(true);
    // ...mais pas le pool, ni les stats par défi (endpoint scindé), ni l'historique
    expect(adminCalls.some(u => u.endsWith('/api/admin/tracks'))).toBe(false);
    expect(adminCalls.some(u => u.includes('/api/admin/challenge-stats'))).toBe(false);
    expect(adminCalls.some(u => /\/api\/admin\/challenges(\?|$)/.test(u))).toBe(false);

    // Ouvrir Pool → GET /api/admin/tracks (une seule fois), toujours rien pour Défis
    await admin.clickTab('Pool');
    await expect.poll(() => adminCalls.some(u => u.endsWith('/api/admin/tracks'))).toBe(true);
    expect(adminCalls.some(u => u.includes('/api/admin/challenge-stats'))).toBe(false);

    // Ouvrir Défis → challenge-stats + challenges
    await admin.clickTab('Défis');
    await expect.poll(() => adminCalls.some(u => u.includes('/api/admin/challenge-stats'))).toBe(true);
    await expect.poll(() => adminCalls.some(u => /\/api\/admin\/challenges(\?|$)/.test(u))).toBe(true);
  });

  test('le compteur des onglets Pool / Défis n\'apparaît qu\'après leur première ouverture', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();

    // Avant visite : libellé nu (pas de "(N)")
    await expect(admin.tab('Pool')).toBeVisible();
    await expect(admin.tab('Défis')).toBeVisible();

    await admin.clickTab('Pool');
    await expect(page.getByRole('button', { name: /^Pool \(\d+\)$/ })).toBeVisible();

    await admin.clickTab('Défis');
    await expect(page.getByRole('button', { name: /^Défis \(\d+\)$/ })).toBeVisible();
  });
});

test.describe('Admin — indicateur joueurs / ID navigateur', () => {
  test('affiche l\'ID du navigateur sur l\'écran de connexion et permet de le copier', async ({ page, api }) => {
    await api.reseed();
    const admin = new AdminPage(page);
    await admin.goto();

    // Visible avant même la connexion — le cookie authToken est posé dès le chargement de l'app.
    await expect(admin.browserIdShort()).toBeVisible();
    const shortId = await admin.browserIdShort().textContent();
    expect(shortId).toMatch(/^[0-9a-f]{8}$/);

    await admin.browserIdCopyButton().click();
    await expect(page.getByText('Copié !')).toBeVisible();

    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipText).toMatch(/^[0-9a-f-]{36}$/i);
    expect(clipText.slice(0, 8)).toBe(shortId);
  });

  test('le joueur qui vient de jouer apparaît en surbrillance "toi" dans Stats par défi', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    const admin = new AdminPage(page);
    await admin.goto();
    const browserShortId = await admin.browserIdShort().textContent();
    expect(browserShortId).toMatch(/^[0-9a-f]{8}$/);

    await admin.login();
    await page.getByRole('button', { name: /Défis/ }).click();

    const today = new Date().toISOString().slice(0, 10);
    const todayRow = admin.challengeRow(today);
    const youChip = todayRow.getByRole('button', { name: /toi/ });
    await expect(youChip).toBeVisible();
    await expect(youChip).toContainText(browserShortId!);

    // Clic gauche = surbrillance croisée : le chip reçoit un anneau (box-shadow non nul).
    await youChip.click();
    await expect(youChip).not.toHaveCSS('box-shadow', 'none');

    // Clic droit = copie l'ID complet (le clic gauche sert à la surbrillance croisée).
    await youChip.click({ button: 'right' });
    await expect(todayRow.getByText('Copié !')).toBeVisible();

    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipText).toHaveLength(36);
    expect(clipText.slice(0, 8)).toBe(browserShortId);
  });

  test('l\'icône d\'un morceau ouvre la pop-up histogramme (avec les chiffres)', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    await page.getByRole('button', { name: /Défis/ }).click();

    const today = new Date().toISOString().slice(0, 10);
    const todayRow = admin.challengeRow(today);
    await todayRow.locator('button').first().click(); // bouton d'accordéon → déplie « Stats par défi »

    const chartIcon = todayRow.getByRole('button', { name: /histogramme des temps de réponse/i }).first();
    await chartIcon.click();

    const chart = page.getByTestId('guess-time-chart');
    await expect(chart).toBeVisible();
    // Vue admin → les chiffres au-dessus des barres sont affichés.
    await expect(chart.locator('[data-bucket] span')).toHaveCount(8);

    await page.keyboard.press('Escape');
    await expect(chart).toBeHidden();
  });
});

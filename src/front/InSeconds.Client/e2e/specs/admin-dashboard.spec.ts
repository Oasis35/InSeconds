import { test, expect } from '../fixtures/test';
import { AdminPage } from '../pages/admin.page';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Admin - défis de l\'Accueil', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('le calendrier et le tableau du mois listent les défis existants ; l\'ancien onglet Défis mène à l\'Accueil', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    // Le seed écrit un défi par jour où un morceau a servi (J-2, J-1, aujourd'hui, mais aussi J-5,
    // J-15, J-30…, cf. CatalogueSeed). Combien tombent dans le mois UTC courant dépend du jour : on les compte depuis l'API.
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7);
    const expectedCount = (await admin.apiGetChallengeDates()).filter(d => d.startsWith(monthPrefix)).length;

    await expect(page.getByRole('link', { name: /^Défis/ })).toHaveCount(0);
    await page.getByTestId('day-picker-toggle').click();
    await expect(page.getByTestId('calendar-day')).toHaveCount(expectedCount);
    await page.getByTestId('day-picker-toggle').click();

    // Le tableau du mois est replié d'office ; ouvert, il a une ligne par défi du mois.
    await expect(page.getByTestId('challenge-table-row')).toHaveCount(0);
    await page.getByTestId('month-challenges-toggle').click();
    await expect(page.getByTestId('challenge-table-row')).toHaveCount(expectedCount);
    await expect(page.getByTestId('day-detail')).toBeVisible();

    await page.goto('/admin/defis?mois=' + monthPrefix);
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });
});

// Recalcul des chiffres figés d'un défi : permis à partir de J-2, refusé pour la veille et le jour même.

test.describe('Admin - recalcul des stats', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('recalcule les stats d\'un défi fini et affiche la date du calcul', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.login();
    const day = daysAgo(2);
    await admin.openDay(day);

    const recompute = page.waitForResponse(r => r.url().endsWith(`/challenges/${day}/stats/recompute`));
    await admin.recomputeDay();
    expect((await recompute).status()).toBe(200);

    // Le seed fige peut-être déjà ce jour : c'est la date du calcul, aujourd'hui (heure locale du navigateur), qui compte.
    const now = new Date();
    const today = [now.getDate(), now.getMonth() + 1].map(n => String(n).padStart(2, '0')).join('/');
    await expect(admin.frozenLine()).toContainText(`Stats figées le ${today}`);
    await expect(admin.frozenLine().getByRole('alert')).toHaveCount(0);
  });

  test('refuse le recalcul d\'un jour encore ouvert (admin.day_not_over)', async ({ page }) => {
    const admin = new AdminPage(page);
    const yesterday = daysAgo(1);
    // La veille n'a pas le bouton (une partie peut encore s'y finir) : on le fait apparaître en retouchant la liste
    // reçue, pour vérifier que l'API refuse quand même et que l'écran le dit.
    await page.route(/\/api\/admin\/daily\/challenges\/stats(\?|$)/, async route => {
      const response = await route.fetch();
      const body = await response.json() as { challenges: { date: string; canRecompute: boolean }[] };
      for (const c of body.challenges) {
        if (c.date.startsWith(yesterday)) c.canRecompute = true;
      }
      await route.fulfill({ response, json: body });
    });
    await admin.goto();
    await admin.login();
    await admin.openDay(yesterday);

    // Réponse lue au passage par page.route, comme dans answers-hidden : avec waitForResponse, Chromium peut avoir
    // libéré le corps quand on le lit (« Response body is not available… navigated away from », test instable).
    let recompute: { status: number; body: string } | undefined;
    await page.route(`**/challenges/${yesterday}/stats/recompute`, async route => {
      const response = await route.fetch();
      const body = await response.text();
      recompute = { status: response.status(), body };
      await route.fulfill({ response, body });
    });

    await admin.recomputeDay();
    await expect.poll(() => recompute).toBeDefined();
    expect(recompute?.status).toBe(409);
    expect((JSON.parse(recompute?.body ?? '{}') as { code?: string }).code).toBe('admin.day_not_over');

    await expect(admin.frozenLine().getByRole('alert')).toHaveText("Ce jour n'est pas encore fini : les stats seront figées demain.");
  });
});

test.describe('Admin - indicateur joueurs / ID navigateur', () => {
  test('affiche l\'ID du navigateur sur l\'écran de connexion et permet de le copier', async ({ page, api }) => {
    await api.reseed();
    const admin = new AdminPage(page);
    await admin.goto();

    // Visible avant même la connexion - le cookie authToken est posé dès le chargement de l'app.
    await expect(admin.browserIdShort()).toBeVisible();
    const shortId = await admin.browserIdShort().textContent();
    expect(shortId).toMatch(/^[0-9a-f]{8}$/);

    await admin.browserIdCopyButton().click();
    await expect(page.getByText('Copié !')).toBeVisible();

    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipText).toMatch(/^[0-9a-f-]{36}$/i);
    expect(clipText.slice(0, 8)).toBe(shortId);
  });

  test('le joueur qui vient de jouer apparaît en surbrillance "toi" dans le détail du jour de l\'Accueil', async ({ page, api }) => {
    await api.reset();
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    await game.playFullGame(new BlindRoundPage(page));

    const admin = new AdminPage(page);
    await admin.goto();
    const browserShortId = await admin.browserIdShort().textContent();
    expect(browserShortId).toMatch(/^[0-9a-f]{8}$/);

    await admin.login();

    const today = new Date().toISOString().slice(0, 10);
    const todayRow = await admin.challengeRow(today);
    const youChip = todayRow.getByRole('button', { name: /toi/ });
    await expect(youChip).toBeVisible();
    // login-as-admin fait de l'invité qui vient de jouer le compte AdminE2E (comme un premier lien
    // magique), le chip montre donc son pseudo ; l'identifiant complet reste dans l'infobulle.
    await expect(youChip).toContainText('AdminE2E');
    await expect(youChip).toHaveAttribute('title', new RegExp(`^${browserShortId}`));

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

    const today = new Date().toISOString().slice(0, 10);
    const todayRow = await admin.challengeRow(today);

    const chartIcon = todayRow.getByRole('button', { name: /répartition des temps/i }).first();
    await chartIcon.click();

    const chart = page.getByTestId('guess-time-chart');
    await expect(chart).toBeVisible();
    // Vue admin → les chiffres au-dessus des barres sont affichés.
    await expect(chart.locator('[data-bucket] span')).toHaveCount(8);

    await page.keyboard.press('Escape');
    await expect(chart).toBeHidden();
  });
});

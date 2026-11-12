import { test, expect } from '../fixtures/test';
import { RunPage } from '../pages/run.page';

// Le classement entre amis (`/ranking`) : un compte crée un groupe, l'invitation (`/ranking/join/<code>`) le fait rejoindre, et seuls ses
// membres voient son classement. L'onglet « Classement » de la barre du bas vient avec l'accès Setlist.

test.describe('Groupes entre amis', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test("un compte crée un groupe, un ami le rejoint par son lien, un invité est renvoyé à la connexion", async ({ page, api, browser }) => {
    const owner = new RunPage(page);
    const ownerId = await owner.loginAsPlayer('lea-groupes@e2e.test', 'LeaGroupes');
    await api.grantRunAccess(ownerId);

    // L'onglet de la barre du bas ouvre le classement : sans groupe, l'invitation à en créer un.
    await page.goto('/daily');
    await page.getByTestId('tab-ranking').click();
    await expect(page).toHaveURL(/\/ranking$/);
    await expect(page.getByTestId('tab-ranking')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('ranking-empty')).toBeVisible();

    // Un nom trop court est refusé sur place ; un nom correct crée le groupe et ouvre son classement.
    await page.getByTestId('ranking-create').click();
    await expect(page).toHaveURL(/\/ranking\/new$/);
    await page.getByTestId('new-group-name').fill('ab');
    await page.getByTestId('new-group-submit').click();
    await expect(page.getByTestId('new-group-error')).toBeVisible();
    await page.getByTestId('new-group-name').fill('Les copains');
    await page.getByTestId('new-group-submit').click();
    await expect(page).toHaveURL(/\/ranking\?group=\d+$/);
    await expect(page.getByTestId('ranking-group')).toHaveText(['Les copains']);
    await expect(page.getByTestId('ranking-row')).toHaveCount(1);
    await expect(page.getByTestId('ranking-row')).toHaveAttribute('data-me', 'true');
    await expect(page.getByTestId('ranking-unplayed')).toBeVisible();

    const groups = (await (await page.request.get('/api/social/groups')).json()) as { groups: { inviteCode: string }[] };
    const link = `/ranking/join/${groups.groups[0].inviteCode}`;

    // Un invité : le nom du groupe, et la connexion à la place de « Rejoindre ».
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.addInitScript(() => {
      (window as { __disableHealthPolling?: boolean }).__disableHealthPolling = true;
      localStorage.setItem('lang', 'fr');
    });
    await guestPage.goto(link);
    await expect(guestPage.getByTestId('join-name')).toHaveText('Les copains');
    await expect(guestPage.getByTestId('join-login')).toBeVisible();
    await expect(guestPage.getByTestId('join-submit')).toHaveCount(0);
    await guestContext.close();

    // Un ami qui a un compte rejoint le groupe et voit les deux membres.
    const friendContext = await browser.newContext();
    const friendPage = await friendContext.newPage();
    await friendPage.addInitScript(() => {
      (window as { __disableHealthPolling?: boolean }).__disableHealthPolling = true;
      localStorage.setItem('lang', 'fr');
    });
    await new RunPage(friendPage).loginAsPlayer('tom-groupes@e2e.test', 'TomGroupes');
    await friendPage.goto(link);
    await expect(friendPage.getByTestId('join-name')).toHaveText('Les copains');
    await friendPage.getByTestId('join-submit').click();
    await expect(friendPage).toHaveURL(/\/ranking\?group=\d+$/);
    await expect(friendPage.getByTestId('ranking-row')).toHaveCount(2);
    await expect(friendPage.getByTestId('ranking-pseudo')).toContainText(['LeaGroupes']);

    // Le lien rouvert : déjà membre. Puis il quitte le groupe, après confirmation.
    await friendPage.goto(link);
    await expect(friendPage.getByTestId('join-already')).toBeVisible();
    await friendPage.goto('/ranking');
    await friendPage.getByTestId('ranking-leave').click();
    await friendPage.getByRole('button', { name: 'Quitter', exact: true }).click();
    await expect(friendPage.getByTestId('ranking-empty')).toBeVisible();
    await friendContext.close();

    // Le créateur ne voit plus que lui.
    await page.reload();
    await expect(page.getByTestId('ranking-row')).toHaveCount(1);
  });

  test("le classement général : personne n'y figure sans l'avoir choisi, le choix est gardé ; les Hits se lisent depuis la Setlist", async ({ page, api }) => {
    const player = new RunPage(page);
    const playerId = await player.loginAsPlayer('zoe-general@e2e.test', 'ZoeGeneral');
    await api.grantRunAccess(playerId);

    // La pastille « Général » : vide, et l'interrupteur éteint par défaut.
    await page.goto('/ranking');
    await page.getByTestId('ranking-general').click();
    await expect(page).toHaveURL(/\/ranking\?view=general$/);
    await expect(page.getByTestId('general-empty')).toBeVisible();
    await expect(page.getByTestId('general-visible')).toHaveAttribute('aria-checked', 'false');

    // Le choix d'apparaître tient au rechargement.
    await page.getByTestId('general-visible').click();
    await expect(page.getByTestId('general-visible')).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.getByTestId('general-visible')).toHaveAttribute('aria-checked', 'true');

    // Le profil y mène.
    await page.goto('/account/profile');
    await page.getByTestId('profile-general-ranking').click();
    await expect(page).toHaveURL(/\/ranking\?view=general$/);

    // Les Hits : la ligne de l'accueil du mode ouvre la liste, rien n'est obtenu sans partie finie.
    await page.goto('/setlist');
    await expect(page.getByTestId('run-hits-count')).toHaveText('0 / 17');
    await page.getByTestId('run-hits-line').click();
    await expect(page).toHaveURL(/\/setlist\/hits$/);
    await expect(page.getByTestId('hit')).toHaveCount(17);
    await expect(page.getByTestId('hits-count')).toHaveText('0 / 17');
    await page.getByTestId('hits-back').click();
    await expect(page).toHaveURL(/\/setlist$/);
  });
});

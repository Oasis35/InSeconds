import type { Browser, Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { RunPage } from '../pages/run.page';

// Le classement entre amis (`/ranking`) : un compte crée un groupe, l'invitation (`/ranking/join/<code>`) le fait rejoindre, et seuls ses
// membres voient son classement du Défi du jour (« Cette semaine », « Aujourd'hui »). Tout cela sans l'accès Survie, qui n'ajoute que la
// pastille « Général » et l'onglet « Survie ».

/** Un autre joueur, dans son propre navigateur. */
async function otherPlayer(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    (window as { __disableHealthPolling?: boolean }).__disableHealthPolling = true;
    localStorage.setItem('lang', 'fr');
  });
  return { page, close: () => context.close() };
}

/** L'en-tête `Cookie` du navigateur de la page, pour jouer sa partie du jour par l'API. */
async function cookieOf(page: Page): Promise<string> {
  return (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

test.describe('Groupes entre amis', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test("sans l'accès Survie : un compte crée un groupe, un invité garde l'invitation jusqu'à son compte, un ami rejoint, le classement suit le défi", async ({ page, api, browser }) => {
    const ownerId = await new RunPage(page).loginAsPlayer('lea-groupes@e2e.test', 'LeaGroupes');

    // L'onglet de la barre du bas ouvre le classement : sans groupe, l'invitation à en créer un.
    await page.goto('/daily');
    await page.getByTestId('tab-ranking').click();
    await expect(page).toHaveURL(/\/ranking$/);
    await expect(page.getByTestId('tab-ranking')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('ranking-empty')).toBeVisible();
    await expect(page.getByTestId('ranking-general')).toHaveCount(0);

    // Un nom trop court est refusé sur place ; un nom correct crée le groupe. Seul dedans : l'invitation à faire venir ses amis.
    await page.getByTestId('ranking-create').click();
    await expect(page).toHaveURL(/\/ranking\/new$/);
    await page.getByTestId('new-group-name').fill('ab');
    await page.getByTestId('new-group-submit').click();
    await expect(page.getByTestId('new-group-error')).toBeVisible();
    await page.getByTestId('new-group-name').fill('Les copains');
    await page.getByTestId('new-group-submit').click();
    await expect(page).toHaveURL(/\/ranking\?group=\d+$/);
    await expect(page.getByTestId('ranking-group')).toHaveText(['Les copains']);
    await expect(page.getByTestId('ranking-alone')).toBeVisible();
    await expect(page.getByTestId('ranking-invite')).toBeVisible();

    const groups = (await (await page.request.get('/api/social/groups')).json()) as { groups: { inviteCode: string }[] };
    const link = `/ranking/join/${groups.groups[0].inviteCode}`;

    // Un invité : le nom du groupe, et la connexion à la place de « Rejoindre ». L'invitation l'attend dans le navigateur : une fois son
    // compte créé, le classement la lui repropose.
    const guest = await otherPlayer(browser);
    await guest.page.goto(link);
    await expect(guest.page.getByTestId('join-name')).toHaveText('Les copains');
    await expect(guest.page.getByTestId('join-login')).toBeVisible();
    await expect(guest.page.getByTestId('join-submit')).toHaveCount(0);
    await new RunPage(guest.page).loginAsPlayer('max-groupes@e2e.test', 'MaxGroupes');
    await guest.page.goto('/ranking');
    await guest.page.getByTestId('ranking-pending').click();
    await guest.page.getByTestId('join-submit').click();
    await expect(guest.page).toHaveURL(/\/ranking\?group=\d+$/);
    await expect(guest.page.getByTestId('score-row')).toHaveCount(2);
    await guest.close();

    // Un ami qui a un compte rejoint le groupe et voit les trois membres, sans aucun point : personne n'a joué.
    const friend = await otherPlayer(browser);
    await new RunPage(friend.page).loginAsPlayer('tom-groupes@e2e.test', 'TomGroupes');
    await friend.page.goto(link);
    await expect(friend.page.getByTestId('join-name')).toHaveText('Les copains');
    await friend.page.getByTestId('join-submit').click();
    await expect(friend.page).toHaveURL(/\/ranking\?group=\d+$/);
    await expect(friend.page.getByTestId('score-row')).toHaveCount(3);
    await expect(friend.page.getByTestId('score-pseudo')).toContainText(['LeaGroupes', 'MaxGroupes']);
    await expect(friend.page.getByTestId('score-unplayed')).toHaveCount(3);
    await expect(friend.page.getByTestId('ranking-period-survie')).toHaveCount(0);

    // Léa joue son défi. Tom, qui n'a pas joué le sien, voit qu'elle a joué, sans son score.
    await api.completeSessionAs(await cookieOf(page));
    await friend.page.reload();
    await friend.page.getByTestId('ranking-period-today').click();
    await expect(friend.page).toHaveURL(/period=today/);
    await expect(friend.page.getByTestId('today-locked')).toBeVisible();
    await expect(friend.page.getByTestId('today-count')).toHaveText('1 sur 3 a joué');
    await expect(friend.page.getByTestId('score-value')).toHaveCount(0);
    await expect(friend.page.getByTestId('ranking-play')).toHaveAttribute('href', '/daily');

    // Tom joue à son tour : « Aujourd'hui » s'ouvre, et la semaine compte un jour joué pour chacun des deux.
    await api.completeSessionAs(await cookieOf(friend.page));
    await friend.page.reload();
    await expect(friend.page.getByTestId('today-locked')).toHaveCount(0);
    await expect(friend.page.getByTestId('score-value')).toHaveCount(2);
    await friend.page.getByTestId('ranking-period-week').click();
    await expect(friend.page.getByTestId('score-days')).toHaveCount(3);
    await expect(friend.page.locator('[data-testid="score-days"][data-played="1"]')).toHaveCount(2);

    // Le lien rouvert : déjà membre. Puis il quitte le groupe, après confirmation.
    await friend.page.goto(link);
    await expect(friend.page.getByTestId('join-already')).toBeVisible();
    await friend.page.goto('/ranking');
    await friend.page.getByTestId('ranking-leave').click();
    await friend.page.getByRole('button', { name: 'Quitter', exact: true }).click();
    await expect(friend.page.getByTestId('ranking-empty')).toBeVisible();
    await friend.close();

    // La créatrice ne voit plus que Max et elle ; sa ligne est la sienne.
    await page.reload();
    await expect(page.getByTestId('score-row')).toHaveCount(2);
    await expect(page.locator('[data-testid="score-row"][data-me="true"]')).toHaveCount(1);

    // L'accès Survie n'ajoute que la pastille « Général » : le groupe garde son classement du Défi, sans onglet « Survie ».
    await api.grantRunAccess(ownerId);
    await page.goto('/ranking?period=survie');
    await expect(page.getByTestId('ranking-general')).toBeVisible();
    await expect(page.getByTestId('ranking-period-week')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('ranking-period-survie')).toHaveCount(0);
    await expect(page.getByTestId('score-row')).toHaveCount(2);
    await expect(page.getByTestId('ranking-row')).toHaveCount(0);
  });

  test("le classement général : vide sans partie finie, le profil y mène ; les Hits se lisent depuis la Survie", async ({ page, api }) => {
    const player = new RunPage(page);
    const playerId = await player.loginAsPlayer('zoe-general@e2e.test', 'ZoeGeneral');
    await api.grantRunAccess(playerId);

    // La pastille « Général » : vide tant que personne n'a fini de partie.
    await page.goto('/ranking');
    await page.getByTestId('ranking-general').click();
    await expect(page).toHaveURL(/\/ranking\?view=general$/);
    await expect(page.getByTestId('general-empty')).toBeVisible();
    // Pas de fenêtre : la ligne « Tu apparais sous ZoeGeneral · Modifier » ; l'alias musical se tire dans la feuille et se garde au rechargement.
    await expect(page.getByTestId('general-identity-name')).toHaveText('ZoeGeneral');
    await page.getByTestId('general-identity-edit').click();
    await page.getByTestId('name-alias').click();
    await expect(page.getByTestId('name-alias-value')).toHaveText(/^\S+ \S+ \d{2,3}$/);
    const alias = (await page.getByTestId('name-alias-value').textContent())!.trim();
    await page.getByTestId('name-save').click();
    await expect(page.getByTestId('general-identity-name')).toHaveText(alias);
    await page.reload();
    await expect(page.getByTestId('general-identity-name')).toHaveText(alias);

    // Le profil y mène, et ouvre directement le choix du nom.
    await page.goto('/account/profile');
    await page.getByTestId('profile-general-ranking').click();
    await expect(page).toHaveURL(/\/ranking\?view=general&edit=name$/);
    await expect(page.getByTestId('name-alias')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // Les Hits : la ligne de l'accueil du mode ouvre la liste, rien n'est obtenu sans partie finie.
    await page.goto('/survie');
    await expect(page.getByTestId('run-hits-count')).toHaveText('0 / 17');
    await page.getByTestId('run-hits-line').click();
    await expect(page).toHaveURL(/\/survie\/hits$/);
    await expect(page.getByTestId('hit')).toHaveCount(17);
    await expect(page.getByTestId('hits-count')).toHaveText('0 / 17');
    await page.getByTestId('hits-back').click();
    await expect(page).toHaveURL(/\/survie$/);
  });
});

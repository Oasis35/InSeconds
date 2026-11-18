import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import type { RunTrack } from '../fixtures/api-client';
import { GamePage } from '../pages/game.page';
import { RunPage } from '../pages/run.page';
import { inSequence } from '../fixtures/sequence';

// Le mode Run (« Survie », la Série) : 3 vies, des manches sans fin (ici de 5 morceaux : les règles d'avant l'équilibrage, `useLegacyRunRules`), une écoute de 10 s qui raccourcit après une manche sans erreur
// et s'allonge après une erreur, 45 s pour répondre. Le tirage est paresseux : l'hôte de test donne les morceaux déjà tirés de la playlist.
// L'écran : la carte du morceau (chrono dans son coin), puis le total du run et la pile des morceaux joués ; un bilan clôt chaque manche.

/** Trois thèmes de 10 morceaux chacun, pris hors de la playlist lancée (de quoi proposer deux thèmes et en tirer un troisième). */
async function seedThemes(page: Page, tracks: RunTrack[]): Promise<void> {
  const post = async (url: string, data: unknown, method: 'post' | 'put' = 'post'): Promise<{ id: number }> => {
    const res = await page.request[method](url, { data });
    expect(res.ok(), `${method} ${url}`).toBe(true);
    return res.status() === 204 ? { id: 0 } : ((await res.json()) as { id: number });
  };
  const list = await page.request.get('/api/admin/catalogue/tracks');
  const inRun = new Set(tracks.map(t => t.deezerTrackId));
  const free = ((await list.json()) as { id: number; deezerTrackId: number; previewStatus: string; isDisabled: boolean }[])
    .filter(t => !t.isDisabled && t.previewStatus === 'available' && !inRun.has(t.deezerTrackId));
  const themes = [await post('/api/admin/catalogue/themes', { name: 'Années 80' }), await post('/api/admin/catalogue/themes', { name: 'Films' }),
    await post('/api/admin/catalogue/themes', { name: 'Rap' })];
  await inSequence(free.slice(0, 30), (track, index) => post(`/api/admin/catalogue/tracks/${track.id}/themes`, { themeIds: [themes[Math.floor(index / 10)].id] }, 'put'));
}

test.describe('Mode Setlist', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
    await api.useLegacyRunRules();
  });

  test("sans accès, pas de carte sur l'accueil et /survie renvoie au jeu du jour ; l'accès ouvert par l'admin la montre", async ({ page, api }) => {
    const game = new GamePage(page);
    const run = new RunPage(page);

    // Un invité : l'accueil ne demande même pas l'accès.
    await game.goto();
    await game.waitForWelcome();
    await expect(run.homeCard).toHaveCount(0);

    // Un compte sans accès : l'accès est demandé, la réponse est non.
    const playerId = await run.loginAsPlayer('joueur-runs@e2e.test', 'JoueurRuns');
    // Corps lu au passage par page.route : avec waitForResponse, Chromium peut l'avoir déjà libéré quand on le lit
    // (« No data found for resource », test instable même après un passage par about:blank).
    let access: { hasAccess: boolean } | undefined;
    await page.route('**/api/runs/me', async route => {
      const response = await route.fetch();
      access = (await response.json()) as { hasAccess: boolean };
      await route.fulfill({ response });
    });
    await game.goto();
    await game.waitForWelcome();
    await expect.poll(() => access?.hasAccess).toBe(false);
    await page.unroute('**/api/runs/me');
    await expect(run.homeCard).toHaveCount(0);

    // L'adresse du mode ne montre rien : retour au jeu du jour, sans laisser /survie dans l'historique.
    await page.goto('/survie');
    await expect(page).toHaveURL(/\/daily$/);
    await game.waitForWelcome();

    // L'admin ouvre l'accès : la carte apparaît sous « Commencer » et mène au mode.
    await api.grantRunAccess(playerId);
    await game.goto();
    await game.waitForWelcome();
    await expect(run.homeCard).toBeVisible();
    await expect(run.homeCard).toContainText('Survie');
    // Le défi du jour n'est pas joué : la carte est discrète (« Jouer » en contour), sous la carte du défi.
    await expect(run.homeCard).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('home-challenge')).toBeVisible();
    // Un seul toucher : la partie démarre sans écran « Commencer » (le son est déverrouillé dans ce clic).
    await page.getByTestId('run-home-play').click();
    await expect(page).toHaveURL(/\/survie$/);
    await expect(run.answerInput).toBeVisible();
    await expect(run.startButton).toHaveCount(0);
  });

  test("nouvelle interface : la barre du bas remplace le pied de page pour un joueur qui a l'accès, et pour lui seul", async ({ page, api }) => {
    const game = new GamePage(page);
    const run = new RunPage(page);
    const bar = page.getByTestId('bottom-bar');

    // Sans l'accès : l'ancienne coque, pied de page compris.
    const playerId = await run.loginAsPlayer('joueur-v4@e2e.test', 'JoueurV4');
    await game.goto();
    await game.waitForWelcome();
    // Sans l'accueil de la V4, la racine est le défi.
    await expect(page).toHaveURL(/\/daily$/);
    await expect(page.getByTestId('footer-language')).toBeVisible();
    await expect(bar).toHaveCount(0);
    await expect(page.getByTestId('header-instagram')).toHaveCount(0);

    // Avec l'accès : la barre, Instagram dans l'en-tête, plus de pied de page, et le défi du jour qui se signale.
    await api.grantRunAccess(playerId);
    await game.goto();
    await game.waitForWelcome();
    // L'accueil est la racine ; le défi seul est sur /daily.
    await expect(page).toHaveURL(/\/$/);
    await expect(bar).toBeVisible();
    await expect(page.getByTestId('footer-language')).toHaveCount(0);
    await expect(page.getByTestId('header-instagram')).toBeVisible();
    await expect(page.getByTestId('tab-daily')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('daily-pending')).toBeVisible();
    // L'accueil de la maquette : la carte du défi, avec sa série dedans, puis la carte Survie.
    await expect(page.getByTestId('home-challenge')).toBeVisible();
    await expect(page.getByTestId('run-home-card')).toHaveAttribute('data-active', 'false');
    // Les liens légaux ont quitté la barre : une ligne discrète sous la carte Survie, et quatre entrées en bas.
    await expect(page.getByTestId('home-legal-line').getByRole('link', { name: 'Confidentialité' })).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Confidentialité' })).toHaveCount(0);
    await expect(page.getByTestId('tab-setlist')).toHaveCount(0);
    await expect(page.getByTestId('tab-account')).toBeVisible();
    await expect(page.getByTestId('header-login')).toHaveCount(0);

    // La carte Survie mène au mode, qui rappelle le défi restant et y ramène ; l'accueil reste allumé dans la barre.
    await page.goto('/survie');
    await expect(run.startButton).toBeVisible();
    await expect(page.getByTestId('tab-daily')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('daily-left').click();
    await expect(page).toHaveURL(/\/$/);
    await game.waitForWelcome();

    // L'historique : un onglet, une page par mode. Rien de joué : chacune le dit, et celle du jeu du jour garde le lien des jours passés,
    // qui a quitté l'accueil.
    await expect(page.getByTestId('welcome-archive')).toHaveCount(0);
    await page.getByTestId('tab-history').click();
    await expect(page).toHaveURL(/\/history\/daily$/);
    await expect(page.getByTestId('tab-history')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('history-count')).toHaveText('0');
    await expect(page.getByTestId('history-empty')).toBeVisible();
    await expect(page.getByTestId('history-archive')).toBeVisible();
    await page.getByTestId('history-tab-setlist').click();
    await expect(page).toHaveURL(/\/history\/survie$/);
    await expect(page.getByTestId('history-empty')).toBeVisible();
    await expect(bar).toBeVisible();
  });

  test("manche sans erreur : le bilan raccourcit l'écoute, la série de bonnes réponses se voit, puis trois vies perdues mènent à la fin", async ({ page, api }) => {
    test.slow();
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();

    // Début : manche 1, trois vies, écoute de 10 s, ni objectif ni total à atteindre.
    await expect(run.roundTitle).toContainText('Manche 1');
    await expect(run.lives).toHaveAttribute('aria-label', 'Vies : 3 sur 3');
    await expect(run.page.getByTestId('run-listen')).toContainText('10');
    await expect(run.clock).toBeVisible();
    await expect(run.pileTracks).toHaveCount(0);

    // Un morceau : la réponse dans la carte montre le morceau et ses points, la pile le prend au morceau suivant.
    const [first] = await api.latestRunTracks();
    await run.answer(`${first.artist} - ${first.title}`);
    await expect(run.answerCard.getByTestId('run-answer-artist')).toHaveText(first.artist);
    await expect(run.answerCard.getByTestId('run-answer-title')).toHaveText(first.title);
    await expect(run.answerCard.getByTestId('run-answer-points')).toHaveText('+100');
    await expect(run.totalScore).toHaveText('100');
    await run.nextTrackButton.click();
    await expect(run.pileTracks).toHaveCount(1);
    await expect(run.pileTracks.first()).toContainText(first.artist);

    // Le reste de la manche : le bilan, sans erreur l'écoute raccourcit (10 s puis 5 s), les vies restent entières.
    const rest = (await api.latestRunTracks()).filter(t => t.round === 1).slice(1);
    await inSequence(rest, track => run.answerRight(track));
    await expect(run.palier).toBeVisible();
    await expect(page.getByTestId('run-palier-title')).toHaveText('Manche 1 terminée');
    await expect(page.getByTestId('run-palier-score')).toHaveText('500');
    await expect(page.getByTestId('run-palier-outcome')).toHaveText('Aucune vie perdue : l’écoute raccourcit.');
    await expect(page.getByTestId('run-palier-next')).toContainText('5');
    await expect(page.getByTestId('run-palier-lives')).toHaveAttribute('aria-label', 'Vies : 3 sur 3');

    // « Manche suivante » lance le premier morceau de la manche 2, à l'écoute de 5 s ; la pile garde la ligne de la manche passée.
    await run.palierNextButton.click();
    await expect(run.roundTitle).toContainText('Manche 2');
    await expect(run.page.getByTestId('run-listen')).toContainText('5');
    await expect(run.paliers).toHaveCount(1);
    await expect(page.getByTestId('run-combo')).toHaveText('5 d’affilée');

    // Trois morceaux ratés : trois vies perdues, la partie est finie.
    await run.loseAllLives();
    await expect(run.disc).toBeVisible();
    await expect(run.found).toBeVisible();
    await expect(run.page.getByTestId('run-final-score')).toBeVisible();
    // Nouvelle interface (le joueur a l'accès) : son niveau, « Rejouer » et « Défier un ami ».
    await expect(run.page.getByTestId('run-level')).toBeVisible();
    await expect(run.page.getByTestId('run-share')).toContainText('Défier un ami');
    await run.page.getByTestId('run-share').click();
    await expect(run.page.getByTestId('share-sheet')).toBeVisible();
    await expect(run.page.getByTestId('share-challenge')).toBeVisible();
    await expect(run.page.getByTestId('share-grid')).toBeVisible();
    await run.page.keyboard.press('Escape');
    await expect(run.page.getByTestId('share-sheet')).toHaveCount(0);
    await expect(run.page.getByTestId('run-play-again-label')).toHaveText('Rejouer');

    // « Revoir » : la partie dans l'historique.
    await run.page.getByTestId('run-level-review').click();
    await expect(page).toHaveURL(/\/history\/survie\/\d+$/);

    // Le record apparaît ensuite sur l'accueil du mode.
    await page.goto('/survie');
    await expect(run.welcome.getByTestId('run-record')).toBeVisible();
  });

  test("une erreur au premier palier garde l'écoute et coûte une vie ; une moitié juste ne coûte rien", async ({ page, api }) => {
    test.slow();
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const first = (await api.latestRunTracks()).filter(t => t.round === 1);

    await run.answerEmpty();
    await expect(run.lives).toHaveAttribute('aria-label', 'Vies : 2 sur 3');
    // Seul l'artiste est juste : la moitié des points, aucune vie perdue.
    await run.answer(`${first[1].artist} - Titre inconnu`);
    await expect(run.answerCard.getByTestId('run-answer-points')).toHaveText('+50');
    await run.nextTrackButton.click();
    await expect(run.lives).toHaveAttribute('aria-label', 'Vies : 2 sur 3');
    await inSequence(first.slice(2), track => run.answerRight(track));

    await expect(run.palier).toBeVisible();
    await expect(page.getByTestId('run-palier-outcome')).toHaveText('L’écoute reste la même.');
    await expect(page.getByTestId('run-palier-lives')).toHaveAttribute('aria-label', 'Vies : 2 sur 3');
  });

  test('partie perdue : trois morceaux ratés mènent directement à la fin, « Rejouer » en tire une autre', async ({ page }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();

    await run.loseAllLives();
    await expect(run.finished).toHaveAttribute('data-status', 'lost');

    // « Rejouer » tire une autre playlist, le premier morceau part dans le clic.
    await run.playAgainButton.click();
    await expect(run.roundTitle).toContainText('Manche 1');
    await expect(run.lives).toHaveAttribute('aria-label', 'Vies : 3 sur 3');
    await expect(run.pileTracks).toHaveCount(0);
  });

  test("thème par manche : proposé dès la manche 2 (deux thèmes et « Thème mystère »), choisi par le premier joueur arrivé et figé dans la playlist", async ({ page, api }) => {
    test.slow();
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    await seedThemes(page, await api.latestRunTracks());

    // Rien n'est proposé pendant la manche 1 : le choix arrive avec la manche 2.
    await expect(page.getByTestId('run-theme')).toHaveCount(0);
    await run.winRound(() => api.latestRunTracks(), 1);
    await expect(async () => {
      if (await run.palierNextButton.isVisible()) await run.palierNextButton.click();
      await expect(page.getByTestId('run-theme')).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(page.locator('[data-theme-id]')).toHaveCount(3);
    await expect(page.locator('[data-theme-id="mystery"]')).toContainText('Thème mystère');
    await expect(run.answerInput).toHaveCount(0);

    // Un thème proposé : les autres lignes s'éteignent, la manche 2 démarre avec son thème dans l'en-tête.
    const tile = page.locator('[data-theme-id]:not([data-theme-id="mystery"])').first();
    const chosenName = (await tile.locator('span.font-bold').innerText()).trim();
    await tile.click();
    await run.continueRound();
    await expect(page.getByTestId('run-theme-pill')).toHaveText(chosenName);

    // Le thème choisi est figé dans les règles de la playlist, sur la manche 2.
    const link = await page.request.get(`/api/runs/challenges/${await api.latestRunCode()}`);
    expect(((await link.json()) as { themes: { round: number; name: string }[] }).themes).toEqual([{ round: 2, name: chosenName }]);
  });

  test("« Thème mystère » : le tirage annonce un thème qui n'était pas proposé", async ({ page, api }) => {
    test.slow();
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    await seedThemes(page, await api.latestRunTracks());
    await run.winRound(() => api.latestRunTracks(), 1);
    await expect(async () => {
      if (await run.palierNextButton.isVisible()) await run.palierNextButton.click();
      await expect(page.getByTestId('run-theme')).toBeVisible({ timeout: 1000 });
    }).toPass();

    const offered = (await page.locator('[data-theme-id]:not([data-theme-id="mystery"]) span.font-bold').allInnerTexts()).map(t => t.trim());
    await page.locator('[data-theme-id="mystery"]').click();
    await run.continueRound();
    const announced = await page.getByTestId('run-theme-pill').innerText();
    expect(['Années 80', 'Films', 'Rap'].filter(name => !offered.includes(name)).includes(announced.trim())).toBe(true);
  });

  test('le chrono à zéro envoie ce qui est tapé, sans confirmation', async ({ page }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    await expect(run.clock).toHaveText('0:45');

    // Le premier son est sorti (le lecteur n'est plus en chargement) : le chrono tourne ; on laisse passer les 45 s sans rien valider.
    await expect(page.getByTestId('round-timer')).not.toHaveText('…');
    await page.clock.fastForward(46_000);

    await run.answerCard.waitFor({ state: 'visible' });
    await expect(run.answerCard.getByTestId('run-answer-artist-verdict')).toContainText('✗');
    await expect(run.answerCard.getByTestId('run-answer-points')).toHaveText('0');
    await expect(run.confirmSubmitButton).toHaveCount(0);
  });

  test("morceau sans extrait : retiré de la manche sans coûter de vie, la partie continue au clic", async ({ page, api }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();

    // Deezer n'a plus l'extrait du 2e morceau : le serveur le retire quand la partie y arrive, à la réponse au 1er.
    await api.removePreviews([tracks[1].deezerTrackId]);
    await run.answer(`${tracks[0].artist} - ${tracks[0].title}`);
    await run.nextTrackButton.click();

    await expect(run.withdrawnCard).toBeVisible();
    await expect(run.withdrawnCard).toContainText('Morceau retiré de la manche');
    // Un morceau retiré ne coûte pas de vie.
    await expect(run.lives).toHaveAttribute('aria-label', 'Vies : 3 sur 3');
    await expect(run.answerInput).toHaveCount(0);

    // Les animations coupées, rien ne part seul : « Morceau suivant » mène au 3e morceau ; le retrait rejoint la pile.
    await run.nextTrackButton.click();
    await expect(run.withdrawnCard).toHaveCount(0);
    await expect(run.pileTracks).toHaveCount(2);
    await expect(run.pileTracks.first()).toContainText('Morceau retiré');
    await run.answerRight(tracks[2]);
  });

  test("partie quittée en cours : l'accueil du mode propose de la reprendre au morceau suivant", async ({ page, api }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();
    await run.answerRight(tracks[0]);
    await expect(run.pileTracks).toHaveCount(1);

    await page.goto('/survie');
    await expect(page.getByRole('heading', { name: 'Partie en pause' })).toBeVisible();
    await run.resumeButton.click();

    // La pile et le total reviennent tels quels.
    await expect(run.pileTracks).toHaveCount(1);
    await expect(run.pileTracks.first()).toContainText(tracks[0].artist);
    await expect(run.totalScore).toHaveText('100');
    await run.answerRight(tracks[1]);
    await expect(run.totalScore).toHaveText('200');
    await expect(run.pileTracks).toHaveCount(2);
  });

  test("lien d'un ami : sans l'accès au mode (visiteur sans identité), un écran de blocage avec un seul bouton vers le défi du jour", async ({ page, api, browser }) => {
    const author = new RunPage(page);
    await author.loginAsAdmin();
    await author.launch();
    await author.loseAllLives();
    const code = await api.latestRunCode();

    // Un ami, dans son propre navigateur, sans identité ni accès : le mode n'est pas ouvert à tous, le lien ne le remplace pas.
    const friendContext = await browser.newContext();
    const friendPage = await friendContext.newPage();
    await friendPage.addInitScript(() => {
      (window as { __disableAnimations?: boolean }).__disableAnimations = true;
      (window as { __disableHealthPolling?: boolean }).__disableHealthPolling = true;
      localStorage.setItem('lang', 'fr');
    });
    const friend = new RunPage(friendPage);
    await friendPage.goto(`/survie/${code}`);
    await expect(friend.statusScreen).toContainText("Survie n’est pas encore ouverte");
    await expect(friend.linkScreen).toHaveCount(0);
    await expect(friendPage.getByTestId('run-retry')).toHaveCount(0);
    await expect(friendPage.getByRole('link', { name: /Créer un compte/i })).toHaveCount(0);

    // Un seul bouton : le défi du jour.
    await friendPage.getByTestId('run-blocked-daily').click();
    await expect(friendPage).toHaveURL(/\/daily$/);

    // Un lien inconnu : même écran de blocage (l'accès se vérifie avant de lire la playlist).
    await friendPage.goto('/survie/ZZZZZZ');
    await expect(friend.statusScreen).toContainText("Survie n’est pas encore ouverte");
    await friendContext.close();
  });

  test("les anciennes adresses /runs et /runs/<code> mènent à /survie en gardant la query string", async ({ page }) => {
    await page.goto('/runs/ZZZZZZ?utm_source=share');
    await expect(page).toHaveURL(/\/survie\/ZZZZZZ\?utm_source=share$/);
  });
});

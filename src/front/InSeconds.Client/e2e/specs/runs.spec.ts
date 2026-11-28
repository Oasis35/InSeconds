import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { RunPage } from '../pages/run.page';
import { inSequence } from '../fixtures/sequence';

// Le mode Run (« Survie », la Série), aux règles actuelles : 3 vies, des manches de 3 morceaux, une écoute de 10 s qui raccourcit après une manche sans
// vie perdue. Ce fichier ne garde que la coque, l'accès, l'invitation et UN parcours ; les règles d'une manche (vies, thèmes, morceau retiré, chrono,
// reprise) sont tenues par les tests d'intégration du back et par Vitest (`runs.page.spec.ts` monte le vrai gabarit). Le tirage est paresseux : l'hôte de
// test donne les morceaux déjà tirés de la playlist.

test.describe('Mode Setlist', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
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
    await expect(page).toHaveURL(/\/$/);
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

  test("coque V4 : la barre du bas est pour tous, la carte Survie seulement pour qui a l'accès", async ({ page, api }) => {
    const game = new GamePage(page);
    const run = new RunPage(page);
    const bar = page.getByTestId('bottom-bar');

    // Sans l'accès : la même coque (barre, Instagram, ligne légale), mais sans carte Survie.
    const playerId = await run.loginAsPlayer('joueur-v4@e2e.test', 'JoueurV4');
    await game.goto();
    await game.waitForWelcome();
    await expect(page).toHaveURL(/\/$/);
    await expect(bar).toBeVisible();
    await expect(page.getByTestId('header-instagram')).toBeVisible();
    await expect(page.getByTestId('home-legal-line')).toBeVisible();
    await expect(page.getByTestId('home-challenge')).toBeVisible();
    await expect(page.getByTestId('run-home-card')).toHaveCount(0);

    // Avec l'accès : la carte Survie apparaît sous celle du défi, et le défi du jour se signale.
    await api.grantRunAccess(playerId);
    await game.goto();
    await game.waitForWelcome();
    // L'accueil est la racine ; la manche seule est sur /daily.
    await expect(page).toHaveURL(/\/$/);
    await expect(bar).toBeVisible();
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

    // L'historique : un onglet, une page par mode. Celle du jeu du jour s'ouvre sur le calendrier du mois, avec « À réécouter » ; celle de la
    // Survie dit qu'il n'a rien joué.
    await expect(page.getByTestId('welcome-archive')).toHaveCount(0);
    await page.getByTestId('tab-history').click();
    await expect(page).toHaveURL(/\/history\/daily$/);
    await expect(page.getByTestId('tab-history')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('history-calendar')).toBeVisible();
    await expect(page.getByTestId('history-month-played')).toContainText('0');
    await expect(page.getByTestId('history-replay')).toBeVisible();
    await page.getByTestId('history-tab-setlist').click();
    await expect(page).toHaveURL(/\/history\/survie$/);
    await expect(page.getByTestId('history-empty')).toBeVisible();
    await expect(bar).toBeVisible();
  });

  test("parcours aux règles actuelles : une manche sans vie perdue raccourcit l'écoute, trois vies perdues mènent à la fin, puis le niveau, le partage, « Revoir » et le record", async ({ page, api }) => {
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

    // Le reste de la manche (trois morceaux en tout) : le bilan, sans vie perdue l'écoute raccourcit (10 s puis 5 s), les vies restent entières.
    const rest = (await api.latestRunTracks()).filter(t => t.round === 1).slice(1);
    expect(rest).toHaveLength(2);
    await inSequence(rest, track => run.answerRight(track));
    await expect(run.palier).toBeVisible();
    await expect(page.getByTestId('run-palier-score')).toHaveText('300');
    await expect(page.getByTestId('run-palier-next')).toContainText('5');
    await expect(page.getByTestId('run-palier-lives')).toHaveAttribute('aria-label', 'Vies : 3 sur 3');

    // « Manche suivante » lance le premier morceau de la manche 2, à l'écoute de 5 s ; la pile garde la ligne de la manche passée.
    await run.palierNextButton.click();
    await expect(run.roundTitle).toContainText('Manche 2');
    await expect(run.page.getByTestId('run-listen')).toContainText('5');
    await expect(run.paliers).toHaveCount(1);
    await expect(page.getByTestId('run-combo')).toBeVisible();

    // Trois morceaux ratés : trois vies perdues, la partie est finie.
    await run.loseAllLives();
    await expect(run.disc).toBeVisible();
    await expect(run.found).toBeVisible();
    await expect(run.page.getByTestId('run-final-score')).toBeVisible();
    // Le joueur a l'accès : son niveau (pas encore de disque, le premier est à 300 points), « Rejouer » et « Défier un ami ».
    await expect(run.page.getByTestId('run-level')).toHaveAttribute('data-disc', 'runs.discs.none');
    await run.page.getByTestId('run-share').click();
    await expect(run.page.getByTestId('share-sheet')).toBeVisible();
    await expect(run.page.getByTestId('share-challenge')).toBeVisible();
    await expect(run.page.getByTestId('share-grid')).toBeVisible();
    await run.page.keyboard.press('Escape');
    await expect(run.page.getByTestId('share-sheet')).toHaveCount(0);
    await expect(run.page.getByTestId('run-play-again-label')).toBeVisible();

    // « Revoir » : la partie dans l'historique.
    await run.page.getByTestId('run-level-review').click();
    await expect(page).toHaveURL(/\/history\/survie\/\d+$/);

    // Le record apparaît ensuite sur l'accueil du mode.
    await page.goto('/survie');
    await expect(run.welcome.getByTestId('run-record')).toBeVisible();
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
    await expect(friendPage).toHaveURL(/\/$/);

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

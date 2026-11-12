import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import type { RunTrack } from '../fixtures/api-client';
import { GamePage } from '../pages/game.page';
import { RunPage } from '../pages/run.page';
import { inSequence } from '../fixtures/sequence';

// Le mode Run (« Setlist ») : 4 manches de 5 morceaux, écoute fixe de 10 s, 45 s pour répondre, (50 + 50) points par morceau × le multiplicateur
// de la manche, et une jauge par manche (40, 50, 60 puis 70 % du maximum). Le tirage est aléatoire : l'hôte de test donne les morceaux de la
// playlist tirée. L'écran : la carte du morceau (chrono dans son coin), puis le total du run et la pile des morceaux joués.

/** Trois thèmes de 10 morceaux chacun, pris hors de la playlist lancée (de quoi proposer deux thèmes et en tirer un troisième, sans réserve). */
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
  });

  test("sans accès, pas de carte sur l'accueil et /setlist renvoie au jeu du jour ; l'accès ouvert par l'admin la montre", async ({ page, api }) => {
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

    // L'adresse du mode ne montre rien : retour au jeu du jour, sans laisser /setlist dans l'historique.
    await page.goto('/setlist');
    await expect(page).toHaveURL(/\/daily$/);
    await game.waitForWelcome();

    // L'admin ouvre l'accès : la carte apparaît sous « Commencer » et mène au mode.
    await api.grantRunAccess(playerId);
    await game.goto();
    await game.waitForWelcome();
    await expect(run.homeCard).toBeVisible();
    await expect(run.homeCard).toContainText('Setlist');
    // Le défi du jour n'est pas joué : la carte est discrète, sans sa phrase d'accroche.
    await expect(run.homeCard).toHaveAttribute('data-compact', 'true');
    await run.homeCard.click();
    await expect(page).toHaveURL(/\/setlist$/);
    await expect(run.startButton).toBeVisible();
  });

  test("nouvelle interface : la barre du bas remplace le pied de page pour un joueur qui a l'accès, et pour lui seul", async ({ page, api }) => {
    const game = new GamePage(page);
    const run = new RunPage(page);
    const bar = page.getByTestId('bottom-bar');

    // Sans l'accès : l'ancienne coque, pied de page compris.
    const playerId = await run.loginAsPlayer('joueur-v4@e2e.test', 'JoueurV4');
    await game.goto();
    await game.waitForWelcome();
    await expect(page.getByTestId('footer-language')).toBeVisible();
    await expect(bar).toHaveCount(0);
    await expect(page.getByTestId('header-instagram')).toHaveCount(0);

    // Avec l'accès : la barre, Instagram dans l'en-tête, plus de pied de page, et le défi du jour qui se signale.
    await api.grantRunAccess(playerId);
    await game.goto();
    await game.waitForWelcome();
    await expect(bar).toBeVisible();
    await expect(page.getByTestId('footer-language')).toHaveCount(0);
    await expect(page.getByTestId('header-instagram')).toBeVisible();
    await expect(page.getByTestId('tab-daily')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('daily-pending')).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Confidentialité' })).toBeVisible();

    // L'onglet Setlist mène au mode, qui rappelle le défi restant et y ramène.
    await page.getByTestId('tab-setlist').click();
    await expect(page).toHaveURL(/\/setlist$/);
    await expect(run.startButton).toBeVisible();
    await expect(page.getByTestId('tab-setlist')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('daily-left').click();
    await expect(page).toHaveURL(/\/daily$/);
    await game.waitForWelcome();

    // L'historique : un onglet, une page par mode. Rien de joué : chacune le dit, et celle du jeu du jour garde le lien des jours passés,
    // qui a quitté l'accueil.
    await expect(page.getByTestId('welcome-archive')).toHaveCount(0);
    await page.getByTestId('tab-history').click();
    await expect(page).toHaveURL(/\/daily\/history$/);
    await expect(page.getByTestId('tab-history')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('history-count')).toHaveText('0');
    await expect(page.getByTestId('history-empty')).toBeVisible();
    await expect(page.getByTestId('history-archive')).toBeVisible();
    await page.getByTestId('history-tab-setlist').click();
    await expect(page).toHaveURL(/\/setlist\/history$/);
    await expect(page.getByTestId('history-empty')).toBeVisible();
    await expect(bar).toBeVisible();
  });

  test("partie gagnée : 20 bonnes réponses, les 4 manches débloquées, le disque d'or et un nouveau record", async ({ page, api }) => {
    // 20 morceaux répondus un à un, chacun avec sa réponse : plus long qu'une partie du jour.
    test.slow();
    // Seul l'Indice se gagne ici : le QCM remplace la saisie, que ce parcours tape (couvert par les tests du store).
    await api.setRunSetting('Runs:Cards', '["hint"]');
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();
    expect(tracks).toHaveLength(20);

    await expect(run.roundTitle).toHaveText('Manche 1');
    await expect(run.toGo).toHaveText(/encore 225 pts pour passer/);
    await expect(run.clock).toBeVisible();
    await expect(run.pileTracks).toHaveCount(0);

    // Manche 1 : la réponse dans la carte montre le morceau et ses points ; la pile le prend au morceau suivant.
    const [first] = tracks;
    await run.answer(`${first.artist} - ${first.title}`);
    await expect(run.answerCard.getByTestId('run-answer-artist')).toHaveText(first.artist);
    await expect(run.answerCard.getByTestId('run-answer-title')).toHaveText(first.title);
    await expect(run.answerCard.getByTestId('run-answer-points')).toHaveText('+100');
    await expect(run.totalScore).toHaveText('100');
    await expect(run.toGo).toHaveText(/encore 125 pts pour passer/);
    await run.nextTrackButton.click();
    await expect(run.pileTracks).toHaveCount(1);
    await expect(run.pileTracks.first()).toContainText(first.artist);
    await run.winRound(tracks.slice(1), 1);

    // La manche passée : sa ligne se pose dans la pile, ses morceaux ne gardent que pochette, forme et points.
    await expect(run.paliers.first()).toContainText('Disque de cire');
    await expect(page.locator('[data-testid="run-pile-track"][data-past]')).toHaveCount(5);
    // Cinq bonnes réponses d'affilée : la série se voit à côté du total, sans aucun point.
    await expect(page.getByTestId('run-combo')).toHaveText('5 d’affilée');

    await run.winRound(tracks, 2);
    await run.winRound(tracks, 3);

    // Dernière manche : la dernière réponse annonce le résultat.
    const last = tracks.filter(t => t.round === 4);
    await inSequence(last.slice(0, 4), track => run.answerRight(track));
    await run.answer(`${last[4].artist} - ${last[4].title}`);
    await expect(run.nextTrackButton).toHaveText(/Voir le résultat/i);
    await run.nextTrackButton.click();

    await expect(run.finished).toHaveAttribute('data-status', 'won');
    await expect(run.disc).toHaveText('Disque d’or !');
    await expect(run.record).toHaveText('Nouveau record');
    await expect(run.found).toHaveText('20 / 20 morceaux trouvés');
    // Nouvelle interface (le joueur a l'accès) : son niveau, encore provisoire après une seule partie, « Nouvelle setlist » et « Défier un ami ».
    await expect(run.page.getByTestId('run-level')).toBeVisible();
    await expect(run.page.getByTestId('run-level-provisional')).toBeVisible();
    await expect(run.page.getByTestId('run-level-delta')).toHaveText(/^\+/);
    await expect(run.page.getByTestId('run-share')).toContainText('Défier un ami');
    await expect(run.playAgainButton).toHaveText('Nouvelle setlist');
    await expect(run.page.getByTestId('run-shortfall')).toHaveCount(0);

    // « Revoir » : la partie dans l'historique, avec ses 20 morceaux.
    await run.page.getByTestId('run-level-review').click();
    await expect(page).toHaveURL(/\/setlist\/history\/\d+$/);

    // Le record et le disque d'or apparaissent ensuite sur l'accueil du mode.
    await page.goto('/setlist');
    await expect(run.welcome.getByTestId('run-record')).toBeVisible();
    await expect(run.welcome.getByTestId('run-level')).toBeVisible();
    await expect(run.welcome.getByTestId('run-level-delta')).toHaveCount(0);
    await expect(run.welcome.getByTestId('run-shelf').locator('[data-shelf-disc]')).toContainText(['×1']);
    await expect(run.welcome.getByTestId('run-shelf').locator('[data-shelf-disc="runs.discs.gold"]')).toHaveCount(1);
  });

  test("playlist à thème : le créateur choisit son thème juste avant la manche (deux thèmes et « Thème mystère »), il est figé dans les règles de la playlist", async ({ page, api }) => {
    test.slow();
    // Sans morceaux de réserve : trois thèmes de 10 morceaux, pris hors de la playlist, suffisent (5 morceaux jouables chacun).
    await api.setRunSetting('Runs:ReservePerRound', '0');
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();

    await seedThemes(page, tracks);
    // Le tirage de la manche à thème est aléatoire : on la place à la manche 2.
    await api.forceThemedRound(2);

    // Rien n'est proposé au lancement ni pendant la manche 1 : le choix arrive juste avant la manche à thème.
    await expect(page.getByTestId('run-theme')).toHaveCount(0);
    await inSequence(tracks.filter(t => t.round === 1), track => run.answerRight(track));
    await expect(page.getByTestId('run-theme')).toBeVisible();
    await expect(page.locator('[data-theme-id]')).toHaveCount(3);
    await expect(page.locator('[data-theme-id="mystery"]')).toContainText('Thème mystère');
    await expect(run.answerInput).toHaveCount(0);

    // Un thème proposé : les autres lignes s'éteignent, puis l'écran de la manche (palier) suit.
    const tile = page.locator('[data-theme-id]:not([data-theme-id="mystery"])').first();
    const chosenName = (await tile.locator('span.font-bold').innerText()).trim();
    await tile.click();
    await expect(run.palier).toBeVisible();
    await expect(page.getByTestId('run-palier-theme')).toContainText(chosenName);

    // Le thème choisi est figé dans les règles de la playlist, sur la manche 2.
    const link = await page.request.get(`/api/runs/challenges/${await api.latestRunCode()}`);
    expect(((await link.json()) as { themes: { round: number; name: string }[] }).themes).toEqual([{ round: 2, name: chosenName }]);
  });

  test("« Thème mystère » : le tirage mouline puis annonce un thème qui n'était pas proposé", async ({ page, api }) => {
    test.slow();
    await api.setRunSetting('Runs:ReservePerRound', '0');
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();
    await seedThemes(page, tracks);
    await api.forceThemedRound(2);
    await inSequence(tracks.filter(t => t.round === 1), track => run.answerRight(track));

    const offered = (await page.locator('[data-theme-id]:not([data-theme-id="mystery"]) span.font-bold').allInnerTexts()).map(t => t.trim());
    await page.locator('[data-theme-id="mystery"]').click();
    await expect(run.palier).toBeVisible();
    const announced = (await page.getByTestId('run-palier-theme').innerText());
    expect(['Années 80', 'Films', 'Rap'].filter(name => !offered.includes(name)).some(name => announced.includes(name))).toBe(true);
  });

  test("« Mélomane » avant la dernière manche : le boss annonce une écoute plus courte, et la partie se gagne jusqu'au bout", async ({ page, api }) => {
    test.slow();
    await api.setRunSetting('Runs:Cards', '["hint"]');
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();

    await run.winRound(tracks, 1);
    // Avant la manche 3 : « Mélomane » ne change pas l'écoute, rien n'annonce de boss.
    await inSequence(tracks.filter(t => t.round === 2), track => run.answerRight(track));
    await expect(run.palier.getByTestId('run-difficulty-safe')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('run-difficulty-boss')).toHaveCount(0);
    await run.palier.getByTestId('run-difficulty-safe').click();
    await expect(run.roundTitle).toHaveText('Manche 3');

    // Avant la dernière manche : seule la colonne « Mélomane » annonce l'écoute du boss (5 s au lieu de 10 s).
    await inSequence(tracks.filter(t => t.round === 3), track => run.answerRight(track));
    await expect(page.getByTestId('run-difficulty-boss')).toHaveCount(1);
    await expect(page.getByTestId('run-difficulty-boss')).toContainText('5');
    await page.getByTestId('run-difficulty-risky').click();
    await expect(run.roundTitle).toHaveText('Manche 4');

    // La manche boss se joue et se gagne comme les autres.
    const last = tracks.filter(t => t.round === 4);
    await inSequence(last.slice(0, 4), track => run.answerRight(track));
    await run.answer(`${last[4].artist} - ${last[4].title}`);
    await run.nextTrackButton.click();
    await expect(run.finished).toHaveAttribute('data-status', 'won');
  });

  test('partie perdue : la première manche ratée mène directement à la fin, avec les manches non jouées', async ({ page }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();

    // 5 réponses vides : 0 point, l'objectif de 225 pts est manqué.
    await run.answerEmpty();
    await run.answerEmpty();
    await run.answerEmpty();
    await run.answerEmpty();
    await expect(run.pileTracks).toHaveCount(4);
    await run.answer(null);
    await expect(run.nextTrackButton).toHaveText(/Voir le résultat/i);
    await run.nextTrackButton.click();

    await expect(run.finished).toHaveAttribute('data-status', 'lost');
    await expect(run.disc).toHaveText('Disque rayé');
    await expect(run.found).toHaveText('0 / 20 morceaux trouvés');
    await expect(run.roundScores.getByText('✕')).toHaveCount(3);
    // Ce qui a manqué pour le premier disque : tout l'objectif de la manche 1.
    await expect(run.page.getByTestId('run-shortfall')).toHaveText('Il t’a manqué 225 pts pour le Disque de cire');

    // « Rejouer » tire une autre playlist, le premier morceau part dans le clic.
    await run.playAgainButton.click();
    await expect(run.roundTitle).toHaveText('Manche 1');
    await expect(run.pileTracks).toHaveCount(0);
  });

  test("une playlist sans coups de pouce ni choix de difficulté se joue comme au proto 1 : ni palier, ni « Difficulté ? »", async ({ page, api }) => {
    // Comme une playlist tirée avant le proto 2 : aucune carte, une seule difficulté (« Normal »), donc rien à choisir.
    await api.setRunSetting('Runs:CardsEnabled', 'false');
    await api.setRunSetting('Runs:Difficulties', '[{"difficulty":"safe","pointsFactor":1,"objectiveFactor":1}]');
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();
    await inSequence(tracks.filter(t => t.round === 1), track => run.answerRight(track));

    // La manche passée enchaîne directement sur la suivante : le premier morceau de la manche 2 se joue.
    await expect(run.roundTitle).toHaveText('Manche 2');
    await expect(run.palier).toHaveCount(0);
    await expect(page.getByTestId('run-difficulty')).toHaveCount(0);
    await expect(run.answerInput).toBeVisible();
  });

  test('une manche passée bien au-delà de l\'objectif donne une carte, qui agit toute seule sur la manche suivante', async ({ page, api }) => {
    await api.setRunSetting('Runs:Cards', '["hint"]');
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();

    // Première manche sans aucune carte : rien à afficher sur le morceau.
    await expect(run.cardEffects).toHaveCount(0);
    await inSequence(tracks.filter(t => t.round === 1), track => run.answerRight(track));

    // Au palier : la carte gagnée est annoncée, sans rien à toucher ; un toucher sur « Normal » lance la manche.
    await expect(run.palier).toBeVisible();
    await expect(page.getByTestId('run-palier-earned')).toContainText('Indice');
    await run.palier.getByTestId('run-difficulty-safe').click();

    // L'indice s'affiche de lui-même sur le morceau (l'année) ; la carte n'est pas un bouton.
    await expect(run.roundTitle).toHaveText('Manche 2');
    await expect(run.cardEffects.and(page.locator('[data-card="hint"]'))).toBeVisible();
  });

  test('« Changer de morceau » : un seul échange par manche, rendu à la manche suivante', async ({ page }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();

    await expect(run.swapLink).toHaveText('Changer de morceau');
    await run.swapLink.click();

    // Le morceau de réserve prend la place : l'échange a servi, le lien disparaît jusqu'à la manche suivante.
    await expect(run.swapLink).toHaveCount(0);
    await expect(run.answerInput).toBeVisible();
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

  test("morceau sans extrait : retiré de la manche, objectif abaissé, la partie continue au clic", async ({ page, api }) => {
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
    // 45 % des 4 morceaux qui restent : 180 pts au lieu de 225, dont 100 déjà marqués.
    await expect(run.withdrawnCard).toContainText('l’objectif abaissé à 180 pts');
    await expect(run.toGo).toHaveText(/encore 80 pts pour passer/);
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

    await page.goto('/setlist');
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

  test("lien d'un ami : lien reçu, partie sans accès jouée une seule fois, comparaison dans deux navigateurs", async ({ page, api, browser }) => {
    // Deux parties perdues à jouer : le temps de deux navigateurs.
    test.slow();
    const author = new RunPage(page);
    await author.loginAsAdmin();
    await author.launch();
    await author.loseFirstRound();
    // Sa propre playlist : pas de duel.
    await expect(page.getByTestId('run-duel')).toHaveCount(0);
    const code = await api.latestRunCode();

    // Un ami, dans son propre navigateur, sans identité ni accès : le lien reçu, ses règles, « Jouer ».
    const friendContext = await browser.newContext();
    const friendPage = await friendContext.newPage();
    await friendPage.addInitScript(() => {
      (window as { __disableAnimations?: boolean }).__disableAnimations = true;
      (window as { __disableHealthPolling?: boolean }).__disableHealthPolling = true;
      localStorage.setItem('lang', 'fr');
    });
    const friend = new RunPage(friendPage);
    await friend.openLink(code);
    await expect(friend.linkTitle).toHaveText('AdminE2E te lance une playlist');
    await expect(friend.linkRules).toContainText('20 morceaux, les mêmes pour tous ses joueurs');
    await expect(friend.linkRules).toContainText('4 manches, de plus en plus dures');
    await expect(friend.linkRules).toContainText('10 s d’écoute, 45 s pour trouver l’artiste et le titre');
    await expect(friend.answerInput).toHaveCount(0);

    // « Jouer » crée l'invité, relève la playlist du créateur et lance le premier morceau.
    await friend.linkPlayButton.click();
    await friend.answerInput.waitFor({ state: 'visible' });
    await expect(friend.roundTitle).toHaveText('Manche 1');
    // Le fantôme de l'auteur, qui a fini la playlist : son total au même morceau et l'écart, dès la première réponse.
    await expect(friendPage.getByTestId('run-ghost')).toHaveCount(0);
    await friend.loseFirstRound(async () => {
      await expect(friendPage.getByTestId('run-ghost')).toContainText('AdminE2E 0');
      await expect(friendPage.getByTestId('run-ghost-gap')).toHaveText('À égalité');
    });

    // Le duel ouvre l'écran de fin (les deux à 0 : égalité), sur un ton neutre.
    await expect(friendPage.getByTestId('run-duel')).toHaveText('Égalité avec AdminE2E');

    // Sans accès, pas de « Rejouer » : le jeu du jour à la place.
    await expect(friend.playAgainButton).toHaveCount(0);
    await expect(friend.toDailyLink).toBeVisible();

    // La comparaison : les deux joueurs, « Toi » sur sa propre ligne, le pseudo de l'auteur en surtitre.
    await friend.compareButton.click();

    // Un invité sans pseudo le donne avant de voir la comparaison : obligatoire (pas de « Passer »), jamais celui d'un compte (sans tenir compte de la casse).
    await expect(friend.pseudoScreen).toBeVisible();
    await expect(friend.pseudoCancel).toHaveCount(0);
    await friend.pseudoInput.fill('admine2e');
    await friend.pseudoSave.click();
    await expect(friend.pseudoError).toContainText('déjà pris');
    await friend.pseudoInput.fill('Léa');
    await friend.pseudoSave.click();

    await expect(friend.comparisonTitle).toHaveText('2 joueurs de cette playlist');
    await expect(friend.comparisonEyebrow).toHaveText('Playlist de AdminE2E');
    await expect(friend.comparisonRows).toHaveCount(2);
    await expect(friend.comparison.getByTestId('run-comparison-name').filter({ hasText: 'Toi' })).toHaveCount(1);
    await expect(friend.comparison.getByText('AdminE2E', { exact: true }).first()).toBeVisible();
    await expect(friend.comparison.getByText('✕')).toHaveCount(6);

    // Une playlist se joue une seule fois : le même lien rouvert mène directement à la comparaison.
    await friendPage.goto(`/setlist/${code}`);
    await expect(friend.comparisonTitle).toHaveText('2 joueurs de cette playlist');
    await expect(friend.linkScreen).toHaveCount(0);

    // Le pseudo est retrouvé à la visite suivante (rien à ressaisir) ; le crayon le change, et l'auteur voit le nouveau.
    await expect(friend.pseudoScreen).toHaveCount(0);
    await friend.pseudoEdit.click();
    await expect(friend.pseudoInput).toHaveValue('Léa');
    await friend.pseudoInput.fill('Léo');
    await friend.pseudoSave.click();
    await expect(friend.comparisonTitle).toHaveText('2 joueurs de cette playlist');

    // L'auteur voit l'invité de l'ami dans le même tableau.
    await page.goto(`/setlist/${code}`);
    await expect(author.comparisonRows).toHaveCount(2);
    await expect(author.comparison.getByText('Léo', { exact: true })).toBeVisible();
    // Le compte garde son pseudo de compte : son crayon existe aussi, il mène à son profil.
    await expect(author.comparison.getByTestId('run-comparison-edit-pseudo')).toBeVisible();

    // Un lien inconnu le dit, sans proposer de réessayer.
    await friendPage.goto('/setlist/ZZZZZZ');
    await expect(friend.statusScreen).toContainText('Playlist introuvable');
    await friendContext.close();
  });

  test("les anciennes adresses /runs et /runs/<code> mènent à /setlist en gardant la query string", async ({ page }) => {
    await page.goto('/runs/ZZZZZZ?utm_source=share');
    await expect(page).toHaveURL(/\/setlist\/ZZZZZZ\?utm_source=share$/);
  });
});

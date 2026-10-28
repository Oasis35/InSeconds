import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { RunPage } from '../pages/run.page';

// Le mode Run (« Platines ») : 4 manches de 5 morceaux, écoute fixe de 10 s, (50 + 50) points par morceau × le multiplicateur de la manche, et une
// jauge par manche (40, 50, 60 puis 70 % du maximum). Le tirage est aléatoire : l'hôte de test donne les morceaux de la playlist tirée.

test.describe('Mode Platines', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test("sans accès, pas de carte sur l'accueil et /runs renvoie au jeu du jour ; l'accès ouvert par l'admin la montre", async ({ page, api }) => {
    const game = new GamePage(page);
    const run = new RunPage(page);

    // Un invité : l'accueil ne demande même pas l'accès.
    await game.goto();
    await game.waitForWelcome();
    await expect(run.homeCard).toHaveCount(0);

    // Un compte sans accès : l'accès est demandé, la réponse est non.
    const playerId = await run.loginAsPlayer('joueur-runs@e2e.test', 'JoueurRuns');
    // La page d'avant est d'abord quittée : une réponse qu'elle recevrait encore serait prise par l'attente, et son corps n'est plus lisible
    // après la navigation (« No data found for resource »). Le corps est lu dès l'arrivée de la réponse.
    await page.goto('about:blank');
    const refused = page
      .waitForResponse(r => r.url().endsWith('/api/runs/me'))
      .then(async r => (await r.json()) as { hasAccess: boolean });
    await game.goto();
    await game.waitForWelcome();
    expect((await refused).hasAccess).toBe(false);
    await expect(run.homeCard).toHaveCount(0);

    // L'adresse du mode ne montre rien : retour au jeu du jour, sans laisser /runs dans l'historique.
    await page.goto('/runs');
    await expect(page).toHaveURL(/\/daily$/);
    await game.waitForWelcome();

    // L'admin ouvre l'accès : la carte apparaît sous « Commencer » et mène au mode.
    await api.grantRunAccess(playerId);
    await game.goto();
    await game.waitForWelcome();
    await expect(run.homeCard).toBeVisible();
    await expect(run.homeCard).toContainText('Platines');
    await expect(run.homeCard).toContainText('Vise le disque d’or.');
    await run.homeCard.click();
    await expect(page).toHaveURL(/\/runs$/);
    await expect(run.startButton).toBeVisible();
  });

  test("partie gagnée : 20 bonnes réponses, les 4 manches débloquées, le disque d'or et un nouveau record", async ({ page, api }) => {
    // 20 morceaux répondus un à un, chacun avec sa carte de réponse : plus long qu'une partie du jour.
    test.slow();
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();
    expect(tracks).toHaveLength(20);

    await expect(run.position).toHaveText('Morceau 1 sur 5');
    await expect(run.objectivePoints).toHaveText('200');

    // Manche 1 : la carte de réponse montre le morceau, ses points et le bouton qui mène au suivant.
    const [first] = tracks;
    await run.answer(`${first.artist} - ${first.title}`);
    await expect(run.answerCard.getByTestId('run-answer-artist')).toHaveText(first.artist);
    await expect(run.answerCard.getByTestId('run-answer-title')).toHaveText(first.title);
    await expect(run.answerCard.getByTestId('run-answer-points')).toHaveText('+100');
    await expect(run.totalScore).toHaveText('100');
    await run.nextTrackButton.click();
    await expect(run.position).toHaveText('Morceau 2 sur 5');
    await run.winRound(tracks.slice(1), 1);
    await expect(run.objectiveLabel).toHaveText('Manche 2 débloquée');
    await run.nextRoundButton.click();

    await run.winRound(tracks, 2);
    await run.nextRoundButton.click();
    await run.winRound(tracks, 3);
    await run.nextRoundButton.click();

    // Dernière manche : elle vise le disque d'or ; son bilan s'affiche avant la fin, et son bouton y mène.
    await run.winRound(tracks, 4);
    await expect(run.objectiveLabel).toHaveText('Disque d’or débloqué');
    await expect(run.nextRoundButton).toHaveText(/Voir le résultat/i);
    await run.nextRoundButton.click();

    await expect(run.finished).toHaveAttribute('data-status', 'won');
    await expect(run.disc).toHaveText('Disque d’or !');
    await expect(run.record).toHaveText('Nouveau record');
    await expect(run.found).toHaveText('20 / 20 morceaux trouvés');
    await expect(run.page.getByTestId('run-share')).toBeVisible();
    await expect(run.playAgainButton).toBeVisible();

    // Le record apparaît ensuite sur l'accueil du mode.
    await page.goto('/runs');
    await expect(run.welcome.getByTestId('run-record')).toBeVisible();
  });

  test('partie perdue : la première manche ratée montre son bilan, puis la fin et les manches non jouées', async ({ page }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();

    // 5 réponses vides : 0 point, l'objectif de 200 pts est manqué.
    await run.answerEmpty();
    await run.answerEmpty();
    await run.answerEmpty();
    await run.answerEmpty();
    await expect(run.position).toHaveText('Morceau 5 sur 5');
    await run.answer(null);
    await expect(run.nextTrackButton).toHaveText(/Fin de la manche/i);
    await run.nextTrackButton.click();

    await expect(run.roundEndTitle).toHaveText('Manche 1 terminée');
    await expect(run.objectiveLabel).toHaveText('Objectif manqué');
    await expect(run.nextRoundButton).toHaveText(/Voir le résultat/i);
    await run.nextRoundButton.click();

    await expect(run.finished).toHaveAttribute('data-status', 'lost');
    await expect(run.disc).toHaveText('Disque rayé');
    await expect(run.found).toHaveText('0 / 20 morceaux trouvés');
    await expect(run.roundScores.getByText('✕')).toHaveCount(3);

    // « Nouvelle partie » tire une autre playlist, le premier morceau part dans le clic.
    await run.playAgainButton.click();
    await expect(run.roundTitle).toHaveText(/Manche 1 \/ 4/i);
    await expect(run.position).toHaveText('Morceau 1 sur 5');
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
    // 40 % des 4 morceaux qui restent : 160 pts au lieu de 200.
    await expect(run.objectiveBefore).toHaveText('200');
    await expect(run.objectivePoints).toHaveText('160');
    await expect(run.withdrawnCard).toContainText('l’objectif abaissé à 160 pts');
    await expect(run.answerInput).toHaveCount(0);

    // Le son ne repart jamais seul : « Morceau suivant » mène au 3e morceau.
    await run.nextTrackButton.click();
    await expect(run.withdrawnCard).toHaveCount(0);
    await expect(run.position).toHaveText('Morceau 3 sur 5');
    await run.answerRight(tracks[2]);
  });

  test("partie quittée en cours : l'accueil du mode propose de la reprendre au morceau suivant", async ({ page, api }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();
    const tracks = await api.latestRunTracks();
    await run.answerRight(tracks[0]);
    await expect(run.position).toHaveText('Morceau 2 sur 5');

    await page.goto('/runs');
    await expect(page.getByRole('heading', { name: 'Partie en pause' })).toBeVisible();
    await run.resumeButton.click();

    await expect(run.position).toHaveText('Morceau 2 sur 5');
    await expect(run.totalScore).toHaveText('100');
    await run.answerRight(tracks[1]);
    await expect(run.totalScore).toHaveText('200');
  });

  test("lien d'un ami : lien reçu, partie sans accès jouée une seule fois, comparaison dans deux navigateurs", async ({ page, api, browser }) => {
    // Deux parties perdues à jouer : le temps de deux navigateurs.
    test.slow();
    const author = new RunPage(page);
    await author.loginAsAdmin();
    await author.launch();
    await author.loseFirstRound();
    const code = await api.latestRunCode();

    // Un ami, dans son propre navigateur, sans identité ni accès : le lien reçu, ses règles, « Jouer ».
    const friendContext = await browser.newContext();
    const friendPage = await friendContext.newPage();
    await friendPage.addInitScript(() => {
      (window as { __disableAnimations?: boolean }).__disableAnimations = true;
      (window as { __disableHealthPolling?: boolean }).__disableHealthPolling = true;
      localStorage.setItem('lang', 'fr');
      localStorage.setItem('inseconds.thanksNoticeSeen', 'v2-launch');
    });
    const friend = new RunPage(friendPage);
    await friend.openLink(code);
    await expect(friend.linkTitle).toHaveText('AdminE2E te lance une playlist');
    await expect(friend.linkRules).toContainText('20 morceaux, les mêmes pour tous ses joueurs');
    await expect(friend.linkRules).toContainText('4 manches, de plus en plus dures');
    await expect(friend.linkRules).toContainText('10 s pour trouver l’artiste et le titre');
    await expect(friend.answerInput).toHaveCount(0);

    // « Jouer » crée l'invité, relève la playlist du créateur et lance le premier morceau.
    await friend.linkPlayButton.click();
    await friend.answerInput.waitFor({ state: 'visible' });
    await expect(friend.position).toHaveText('Morceau 1 sur 5');
    await friend.loseFirstRound();

    // Sans accès, pas de « Nouvelle partie » : le jeu du jour à la place.
    await expect(friend.playAgainButton).toHaveCount(0);
    await expect(friend.toDailyLink).toBeVisible();

    // La comparaison : les deux joueurs, « Toi » sur sa propre ligne, le pseudo de l'auteur en surtitre.
    await friend.compareButton.click();
    await expect(friend.comparisonTitle).toHaveText('2 joueurs de cette playlist');
    await expect(friend.comparisonEyebrow).toHaveText('Playlist de AdminE2E');
    await expect(friend.comparisonRows).toHaveCount(2);
    await expect(friend.comparison.getByTestId('run-comparison-name').filter({ hasText: 'Toi' })).toHaveCount(1);
    await expect(friend.comparison.getByText('AdminE2E', { exact: true }).first()).toBeVisible();
    await expect(friend.comparison.getByText('✕')).toHaveCount(6);

    // Une playlist se joue une seule fois : le même lien rouvert mène directement à la comparaison.
    await friendPage.goto(`/runs/${code}`);
    await expect(friend.comparisonTitle).toHaveText('2 joueurs de cette playlist');
    await expect(friend.linkScreen).toHaveCount(0);

    // L'auteur voit l'invité de l'ami dans le même tableau.
    await page.goto(`/runs/${code}`);
    await expect(author.comparisonRows).toHaveCount(2);
    await expect(author.comparison.getByText('Invité', { exact: true })).toBeVisible();

    // Un lien inconnu le dit, sans proposer de réessayer.
    await friendPage.goto('/runs/ZZZZZZ');
    await expect(friend.statusScreen).toContainText('Playlist introuvable');
    await friendContext.close();
  });
});

import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { RunPage } from '../pages/run.page';
import { inSequence } from '../fixtures/sequence';

// Le mode Run (« Platines ») : 4 manches de 5 morceaux, écoute fixe de 10 s, 45 s pour répondre, (50 + 50) points par morceau × le multiplicateur
// de la manche, et une jauge par manche (40, 50, 60 puis 70 % du maximum). Le tirage est aléatoire : l'hôte de test donne les morceaux de la
// playlist tirée. L'écran : la carte du morceau (chrono dans son coin), puis le total du run et la pile des morceaux joués.

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
    // 20 morceaux répondus un à un, chacun avec sa réponse : plus long qu'une partie du jour.
    test.slow();
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
    await expect(run.page.getByTestId('run-share')).toContainText('Partager mon score');
    // Gagnée : « Rejouer » en action principale, rien n'a manqué.
    await expect(run.playAgainButton).toHaveText('Rejouer');
    await expect(run.page.getByTestId('run-shortfall')).toHaveCount(0);

    // Le record et le disque d'or apparaissent ensuite sur l'accueil du mode.
    await page.goto('/runs');
    await expect(run.welcome.getByTestId('run-record')).toBeVisible();
    await expect(run.welcome.getByTestId('run-shelf').locator('[data-shelf-disc]')).toContainText(['×1']);
    await expect(run.welcome.getByTestId('run-shelf').locator('[data-shelf-disc="runs.discs.gold"]')).toHaveCount(1);
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

  test('la carte de départ se joue pendant le morceau : elle quitte la main et son effet reste sur la manche', async ({ page }) => {
    const run = new RunPage(page);
    await run.loginAsAdmin();
    await run.launch();

    // La playlist tire une carte de départ au hasard (sa graine) : on joue celle qui est en main. Toutes se jouent sur le premier morceau du
    // catalogue de test : chaque morceau y a son année, il reste assez d'autres artistes pour les leurres de « Trois choix », la réserve existe
    // pour le Joker, et le chrono n'est pas écoulé.
    await expect(run.handCards).toHaveCount(1);
    const card = (await run.handCards.getAttribute('data-testid'))!.replace('run-play-', '');
    await run.handCards.click();

    await expect(run.handCards).toHaveCount(0);
    if (card === 'joker') {
      // Le Joker change de morceau : rien ne reste affiché, la manche continue sur le morceau de réserve.
      await expect(run.cardEffects).toHaveCount(0);
      await expect(page.getByTestId('round-timer')).not.toHaveText('…');
    } else {
      await expect(run.cardEffects.and(page.locator(`[data-card="${card}"]`))).toBeVisible();
      if (card === 'three_choices') await expect(page.getByTestId('round-choice')).toHaveCount(3);
    }
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

    await page.goto('/runs');
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

    // Sans accès, pas de « Rejouer » : le jeu du jour à la place.
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

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
    const refused = page.waitForResponse(r => r.url().endsWith('/api/runs/me'));
    await game.goto();
    await game.waitForWelcome();
    expect(((await (await refused).json()) as { hasAccess: boolean }).hasAccess).toBe(false);
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
});

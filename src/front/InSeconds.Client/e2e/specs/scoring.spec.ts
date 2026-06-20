import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Valeurs DurationScores depuis les settings par défaut :
// 0.5s → 1000 pts, 1s → 850 pts, 10s → 100 pts
// Artiste seul ou titre seul = 50 % du score palier

test.describe('Scoring par palier', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('palier court (0.5s) donne plus de points que palier long (10s)', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    // Morceau 1 : 0.5s avec bonne réponse → 1000 pts (artiste + titre)
    // Les tracks du seed aujourd'hui : Eminem, Radiohead, Billie Eilish
    await round.chooseDuration(0.5);
    await round.advanceClock(0.5);
    await round.waitForAnswerInput();
    await round.typeAnswer('Eminem - Lose Yourself');
    await round.submit();

    // Attendre l'écran résultat avant de lire le score
    await round.nextButton.waitFor({ state: 'visible' });
    // Afficher la bonne réponse pour diagnostic
    const correctAnswer = await page.locator('p').filter({ hasText: ' — ' }).last().textContent();
    console.log('DEBUG bonne réponse track 1:', correctAnswer);
    const score1Text = await round.roundScore.textContent();
    const score1 = parseInt(score1Text?.replace(/\D/g, '') ?? '0', 10);

    await round.goNext();

    // Morceau 2 : 10s avec bonne réponse → 100 pts (artiste + titre)
    await round.chooseDuration(10);
    await round.advanceClock(10);
    await round.waitForAnswerInput();
    await round.typeAnswer('Radiohead - Creep');
    await round.submit();

    await round.nextButton.waitFor({ state: 'visible' });
    const score2Text = await round.roundScore.textContent();
    const score2 = parseInt(score2Text?.replace(/\D/g, '') ?? '0', 10);

    expect(score1).toBeGreaterThan(score2);

    await round.goNext();
    await round.playRound(1);
    await game.waitForDone();
  });

  test('mauvaise réponse donne 0 point', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    // Morceau 1 : réponse clairement fausse
    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();
    await round.typeAnswer('zzz réponse invalide zzz');
    await round.submit();

    // Le score affiché dans le résultat est "+0"
    await expect(round.page.getByText('+0')).toBeVisible();

    await round.goNext();
    // Finir les 2 morceaux restants
    for (let i = 0; i < 2; i++) {
      await round.playRound(1);
    }
    await game.waitForDone();
  });

  test('scoring partiel : artiste seul = moitié des points du palier', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    // Morceau 1 à 1s (850 pts full) : on ne soumet que l'artiste
    // Format "Artiste - " sans titre → split donne artist='Eminem', title=''
    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();
    await round.typeAnswer('Eminem - ');
    await round.submit();

    await round.nextButton.waitFor({ state: 'visible' });
    const scoreText = await round.roundScore.textContent();
    const score = parseInt(scoreText?.replace(/\D/g, '') ?? '0', 10);
    // Artiste seul = 50 % × 850 = 425 pts
    expect(score).toBe(425);

    await round.goNext();
    for (let i = 0; i < 2; i++) {
      await round.playRound(1);
    }
    await game.waitForDone();
  });
});

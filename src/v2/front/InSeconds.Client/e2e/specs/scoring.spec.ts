import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Valeurs DurationScores depuis les settings par défaut :
// 0.5s → 1000 pts, 1s → 850 pts, 10s → 100 pts
// Artiste seul ou titre seul = 50 % du score palier

test.describe('Scoring par palier', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('palier court (0.5s) donne plus de points que palier long (10s)', async ({ page }) => {
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.startWithFakeClock();

    // Morceau 1 : 0.5s avec bonne réponse → 1000 pts (artiste + titre)
    // Les tracks du seed aujourd'hui : Eminem, Radiohead, Billie Eilish, Kanye West, JAY Z
    await round.chooseDuration(0.5);
    await round.waitForAnswerInput();
    await round.typeAnswer('Eminem - Lose Yourself');
    await round.submit();

    const score1 = await round.readRoundScore();

    await round.goNext();

    // Morceau 2 : 10s avec bonne réponse → 100 pts (artiste + titre)
    await round.chooseDuration(10);
    await round.waitForAnswerInput();
    await round.typeAnswer('Radiohead - Creep');
    await round.submit();

    const score2 = await round.readRoundScore();

    expect(score1).toBeGreaterThan(score2);

    await round.goNext();
    // Finir les 3 morceaux restants (5 morceaux/défi au total)
    await game.finishGame(round, 3);
  });

  test('mauvaise réponse donne 0 point', async ({ page }) => {
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.startWithFakeClock();

    // Morceau 1 : réponse clairement fausse
    await round.chooseDuration(1);
    await round.waitForAnswerInput();
    await round.typeAnswer('zzz réponse invalide zzz');
    await round.submit();

    // Le score affiché dans le résultat est "+0"
    await expect(round.page.getByText('+0')).toBeVisible();

    await round.goNext();
    // Finir les 4 morceaux restants (5 morceaux/défi au total)
    await game.finishGame(round, 4);
  });

  test('scoring partiel : artiste seul = moitié des points du palier', async ({ page }) => {
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.startWithFakeClock();

    // Morceau 1 à 1s (850 pts full) : on ne soumet que l'artiste
    // Format "Artiste - " sans titre → split donne artist='Eminem', title=''
    await round.chooseDuration(1);
    await round.waitForAnswerInput();
    await round.typeAnswer('Eminem - ');
    await round.submit();

    const score = await round.readRoundScore();
    // Artiste seul = 50 % × 850 = 425 pts
    expect(score).toBe(425);

    await round.goNext();
    // Finir les 4 morceaux restants (5 morceaux/défi au total)
    await game.finishGame(round, 4);
  });
});

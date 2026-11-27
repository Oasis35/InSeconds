import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Seconde tentative (piège 51) : une réponse pas entièrement juste ne montre rien de la correction, une phrase factuelle (« dernier essai ») apparaît sous le champ, la saisie
// reste, et la seconde réponse est définitive, à 70 % du prix du palier.
test.describe('Seconde tentative', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('une réponse fausse ouvre une seconde tentative à 70 %, la seconde juste est comptée', async ({ page }) => {
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.startWithFakeClock();

    await round.chooseDuration(1);
    await round.waitForAnswerInput();
    await round.typeAnswer('zzz réponse invalide zzz');
    await round.submit();

    // Rien n'est révélé : la phrase est là, la saisie est gardée, aucun score ni bonne réponse.
    await expect(round.retryNotice).toBeVisible();
    await expect(round.answerInput).toHaveValue('zzz réponse invalide zzz');
    await expect(round.nextButton).toBeHidden();
    await expect(page.getByText('Eminem')).toHaveCount(0);
    // Les points en jeu passent à 850 × 0,7 = 595.
    await expect(round.stake).toHaveText('595');

    await round.typeAnswer('Eminem - Lose Yourself');
    await round.submit();

    expect(await round.readRoundScore()).toBe(595);
    await round.goNext();
    await game.finishGame(round, 4);
  });

  test('une seconde réponse fausse est définitive : 0 point, pas de troisième tentative', async ({ page }) => {
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.startWithFakeClock();

    await round.chooseDuration(1);
    await round.waitForAnswerInput();
    await round.typeAnswer('zzz réponse invalide zzz');
    await round.submitWrongTwice();

    expect(await round.readRoundScore()).toBe(0);
    await expect(round.retryNotice).toBeHidden();
    await round.goNext();
    await game.finishGame(round, 4);
  });
});

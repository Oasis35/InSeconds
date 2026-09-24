import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Suggestions fournies par le déclencheur `dedup-test` du FakeDeezerHandler :
// « E2E Artist — E2E Track » puis « Other Artist — Another Track ».
test.describe('Autocomplete Deezer — navigation clavier', () => {
  let round: BlindRoundPage;

  test.beforeEach(async ({ api, page }) => {
    await api.reset();
    round = new BlindRoundPage(page);
    await new GamePage(page).startFirstRound(round);
    await round.showDedupSuggestions();
  });

  const pressKeys = async (...keys: string[]) => {
    for (const key of keys) await round.answerInput.press(key);
  };

  test('flèche bas puis Entrée sélectionne la première suggestion', async () => {
    await pressKeys('ArrowDown', 'Enter');

    await expect(round.answerInput).toHaveValue('E2E Artist - E2E Track');
  });

  test('flèche bas deux fois sélectionne la deuxième suggestion (cycle)', async () => {
    await pressKeys('ArrowDown', 'ArrowDown', 'Enter');

    await expect(round.answerInput).toHaveValue('Other Artist - Another Track');
  });

  test('flèche haut sans sélection active va directement à la dernière suggestion', async () => {
    await pressKeys('ArrowUp', 'Enter');

    await expect(round.answerInput).toHaveValue('Other Artist - Another Track');
  });

  test('Échap ferme la dropdown sans modifier le champ', async ({ page }) => {
    await pressKeys('ArrowDown', 'Escape');

    await expect(page.getByRole('listitem')).toHaveCount(0);
    await expect(round.answerInput).toHaveValue('dedup-test');
  });
});

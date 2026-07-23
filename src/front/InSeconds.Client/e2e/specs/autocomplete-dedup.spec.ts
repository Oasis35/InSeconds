import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Autocomplete Deezer — nettoyage parenthèses + déduplication', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('les variantes parenthésées du même morceau fusionnent en une seule suggestion nettoyée', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();

    // FakeDeezerHandler (back, mode Testing) reconnaît ce déclencheur et renvoie 3 variantes
    // du même morceau ("E2E Track (Remastered 2011)", "E2E Track (Live)", "E2E Track") +
    // un morceau distinct — cf. DeezerSearchTests (intégration back) pour le même scénario.
    await round.answerInput.fill('dedup-test');
    // Déclenche le debounce 300ms de DeezerAutocompleteService (RxJS, soumis à la fake clock) ;
    // la requête HTTP réelle qui suit n'est pas simulée et revient en temps réel.
    await page.clock.fastForward(350);

    const suggestions = page.getByRole('listitem');
    await expect(suggestions).toHaveCount(2);
    await expect(suggestions.nth(0)).toHaveText('E2E Artist — E2E Track');
    await expect(suggestions.nth(1)).toHaveText('Other Artist — Another Track');
  });

  test('sélectionner une suggestion nettoyée remplit le champ sans parenthèses', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    await round.chooseDuration(1);
    await round.advanceClock(1);
    await round.waitForAnswerInput();

    await round.answerInput.fill('dedup-test');
    await page.clock.fastForward(350);

    const suggestions = page.getByRole('listitem');
    await expect(suggestions).toHaveCount(2);
    await suggestions.first().click();

    await expect(round.answerInput).toHaveValue('E2E Artist - E2E Track');
  });
});

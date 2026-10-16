import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Déclencheur `dedup-test` du FakeDeezerHandler : 3 variantes du même morceau
// ("E2E Track (Remastered 2011)", "E2E Track (Live)", "E2E Track") + un morceau distinct —
// cf. DeezerSearchTests (intégration back) pour le même scénario.
test.describe('Autocomplete Deezer — nettoyage parenthèses + déduplication', () => {
  let round: BlindRoundPage;

  test.beforeEach(async ({ api, page }) => {
    await api.reset();
    round = new BlindRoundPage(page);
    await new GamePage(page).startFirstRound(round);
  });

  test('les variantes parenthésées du même morceau fusionnent en une seule suggestion nettoyée', async () => {
    const suggestions = await round.showDedupSuggestions();

    await expect(suggestions.nth(0)).toHaveText('E2E Artist — E2E Track');
    await expect(suggestions.nth(1)).toHaveText('Other Artist — Another Track');
  });

  test('sélectionner une suggestion nettoyée remplit le champ sans parenthèses', async () => {
    const suggestions = await round.showDedupSuggestions();
    await suggestions.first().click();

    await expect(round.answerInput).toHaveValue('E2E Artist - E2E Track');
  });
});

import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Les réponses du jour ne doivent pas être lisibles avant de jouer : ni dans les stats du
// jour (appel direct à l'API), ni via l'identifiant Deezer envoyé au démarrage.
test.describe('Réponses du jour cachées avant de jouer', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('les stats du jour ne donnent pas les morceaux à un visiteur, même si quelqu\'un a joué', async ({ api }) => {
    await api.completeSessionAsNewGuest();

    const stats = await api.getTodayStatsAnonymously();

    expect(stats.totalPlayers).toBe(1);
    expect(stats.tracks).toEqual([]);
  });

  test('le démarrage n\'envoie pas l\'identifiant Deezer, révélé seulement après la réponse', async ({ page }) => {
    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.openWithFakeClock();

    const startResponse = page.waitForResponse(r =>
      r.url().endsWith('/api/sessions') && r.request().method() === 'POST');
    await game.clickStart();
    expect(await (await startResponse).text()).not.toContain('deezerTrackId');

    await round.chooseDuration(1);
    await round.waitForAnswerInput();
    await round.submitEmpty();

    // Écran de révélation : le lien « À écouter sur Deezer » pointe sur le morceau.
    await expect(page.locator('app-blind-round a[href*="deezer.com/track/"]')).toHaveAttribute(
      'href', /deezer\.com\/track\/\d+$/);
  });

  test('après la partie, l\'écran « déjà joué » montre les morceaux avec leur lien Deezer', async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    const game = new GamePage(page);
    await game.completeGameThenReload(new BlindRoundPage(page));
    await expect(game.alreadyPlayedHeading).toBeVisible();

    await game.showTracksButton.click();

    await expect(page.locator('app-track-results-list a[href*="deezer.com/track/"]')).toHaveCount(5);
  });
});

import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Bouton partager', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('copie le score dans le presse-papier après la partie', async ({ page }) => {
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    for (let i = 0; i < 3; i++) {
      await round.playRound(1);
    }

    await game.waitForDone();
    await game.shareButton.click();

    // Le bouton passe en "✓ Copié !"
    await expect(game.shareCopiedButton).toBeVisible();

    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipText).toContain('InSeconds 🎵');
    expect(clipText).toContain('pts');
    expect(clipText).toMatch(/https?:\/\//); // contient une URL (appUrl selon l'environnement)
    expect(clipText).toMatch(/[✅❌]/); // emojis résultat (✅ correct, ❌ raté)
    expect(clipText).not.toMatch(/[🟩🟨🟥⬜]/); // plus d'emojis couleur durée
  });

  test("affiche un message d'erreur si la copie presse-papier échoue", async ({ page }) => {
    // Simuler un rejet de clipboard.writeText (permission refusée) avant le chargement de l'app
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
        configurable: true,
      });
    });
    await page.clock.install({ time: Date.now() });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);

    await game.goto();
    await game.waitForWelcome();
    await game.clickStart();

    for (let i = 0; i < 3; i++) {
      await round.playRound(1);
    }

    await game.waitForDone();
    await game.shareButton.click();

    // Le hint est remplacé par le message d'erreur, pas d'état "Copié"
    await expect(page.getByText('Impossible de copier dans le presse-papier.')).toBeVisible();
    await expect(game.shareCopiedButton).not.toBeVisible();
  });
});

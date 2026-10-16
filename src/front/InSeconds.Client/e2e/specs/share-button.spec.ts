import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

test.describe('Bouton partager', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('copie le score dans le presse-papier après la partie', async ({ page }) => {
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await game.finishGame(new BlindRoundPage(page), 5);
    await game.shareButton.click();

    // Le bouton passe en "Copié !"
    await expect(game.shareCopiedButton).toBeVisible();

    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipText).toContain('InSeconds 🎵');
    expect(clipText).toContain('pts');
    expect(clipText).toMatch(/https?:\/\//); // contient une URL (appUrl selon l'environnement)
    expect(clipText).toMatch(/[✅❌]/); // emojis résultat (✅ correct, ❌ raté)
    expect(clipText).not.toMatch(/[🟩🟨🟥⬜]/); // plus d'emojis couleur durée
  });

  test('copie quand même si clipboard.writeText échoue (repli execCommand, #200)', async ({ page }) => {
    // writeText rejeté (échec intermittent « Document is not focused » / NotAllowedError) :
    // le repli textarea + execCommand('copy') doit prendre le relais au premier clic.
    await page.addInitScript(() => {
      // Garde le vrai presse-papier pour relire ce que le repli y a écrit.
      (window as unknown as { __realClipboard: Clipboard }).__realClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError')) },
        configurable: true,
      });
    });
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await game.finishGame(new BlindRoundPage(page), 5);
    await game.shareButton.click();

    await expect(game.shareCopiedButton).toBeVisible();
    const copied = await page.evaluate(() => (window as unknown as { __realClipboard: Clipboard }).__realClipboard.readText());
    expect(copied).toContain('InSeconds 🎵');
    expect(copied).toMatch(/[✅❌]/);
  });

  test("affiche un message d'erreur si la copie presse-papier échoue", async ({ page }) => {
    // Simuler un rejet de clipboard.writeText (permission refusée) et un repli execCommand en échec
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
        configurable: true,
      });
      document.execCommand = () => false;
    });
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await game.finishGame(new BlindRoundPage(page), 5);
    await game.shareButton.click();

    // Le message d'erreur s'affiche, pas d'état "Copié"
    await expect(page.getByText('Impossible de copier dans le presse-papier.')).toBeVisible();
    await expect(game.shareCopiedButton).not.toBeVisible();
  });
});

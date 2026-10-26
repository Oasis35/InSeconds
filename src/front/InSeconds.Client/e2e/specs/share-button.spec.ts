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
    // « InSeconds · 21/10 », une ligne d'un ✅/🔶/🅾️ par morceau, le score, le lien : ni 🎵, ni 🏆, ni palier écouté.
    const lines = clipText.split('\n');
    expect(lines[0]).toMatch(/^InSeconds · \d{2}\/\d{2}$/);
    expect(lines[1]).toMatch(/^(✅|🔶|🅾️){5}$/u);
    expect(lines[2]).toMatch(/^[\d\s\u202f]+ pts$/);
    expect(lines[3]).toMatch(/^https?:\/\/[^/]+\/\?utm_source=share$/);
    expect(clipText).not.toMatch(/🎵|🏆/u);
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
    expect(copied).toContain('InSeconds · ');
    expect(copied).toMatch(/✅|🔶|🅾️/u);
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

  test("ouvre le menu de partage du téléphone sur écran tactile, sans rien copier", async ({ page }) => {
    // Chromium headless n'a pas navigator.share et son pointeur est fin : on simule un téléphone qui en a un.
    await page.addInitScript(() => {
      const shared: ShareData[] = [];
      (window as unknown as { __shared: ShareData[] }).__shared = shared;
      Object.defineProperty(navigator, 'share', {
        value: (data: ShareData) => { shared.push(data); return Promise.resolve(); },
        configurable: true,
      });
      const realMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query === '(pointer: coarse)' ? ({ ...realMatchMedia(query), matches: true, media: query } as MediaQueryList) : realMatchMedia(query);
    });
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await game.finishGame(new BlindRoundPage(page), 5);
    await game.shareButton.click();

    const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
    expect(shared).toHaveLength(1);
    const lines = (shared[0].text ?? '').split('\n');
    expect(lines[0]).toMatch(/^InSeconds · \d{2}\/\d{2}$/);
    expect(lines[1]).toMatch(/^(✅|🔶|🅾️){5}$/u);
    expect(lines[3]).toMatch(/^https?:\/\/[^/]+\/\?utm_source=share$/);
    // Le menu du téléphone suffit : pas de « Copié ! ».
    await expect(game.shareCopiedButton).not.toBeVisible();
  });
});

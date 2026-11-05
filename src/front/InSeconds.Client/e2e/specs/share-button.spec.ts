import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';
import { shareTextProblems } from '../fixtures/share-text';

/**
 * Simule un téléphone : Chromium headless n'a pas `navigator.share` et son pointeur est fin. Comme Safari sur iPhone, le faux menu refuse
 * (`NotAllowedError`) un appel qui ne part pas d'un geste du joueur : un `await` avant `navigator.share` le ferait échouer.
 */
async function simulatePhoneShareMenu(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    (window as unknown as { __shared: ShareData[] }).__shared = shared;
    Object.defineProperty(navigator, 'share', {
      value: (data: ShareData) => {
        if (!navigator.userActivation.isActive) return Promise.reject(new DOMException('Hors d un geste', 'NotAllowedError'));
        shared.push(data);
        return Promise.resolve();
      },
      configurable: true,
    });
    const realMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query === '(pointer: coarse)' ? ({ ...realMatchMedia(query), matches: true, media: query } as MediaQueryList) : realMatchMedia(query);
  });
}

const sharedTexts = (page: Page) => page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared.map(d => d.text ?? ''));


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
    // Le format court : « 2 410 pts · InSeconds 05/11 », un emoji par morceau (✅ / 🔶 / 🅾️), le lien marqué utm_source=share.
    expect(shareTextProblems(clipText, 5)).toEqual([]);
  });

  test('la flèche ▾ propose le format détaillé : une ligne par morceau et le lien marqué utm_source=share-long', async ({ page }) => {
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await game.finishGame(new BlindRoundPage(page), 5);

    const toggle = page.getByTestId('share-format-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByTestId('share-format-menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    // L'aperçu du court est la ligne d'emojis de la partie ; celui du détaillé, sa première ligne.
    await expect(menu.locator('[data-format="short"]')).toContainText(/(✅|🔶|🅾️){5}/u);
    await expect(menu.locator('[data-format="long"]')).toContainText(/[✅❌]{2} \d/u);

    // Le compteur de l'admin reçoit le format choisi.
    const counted = page.waitForRequest(r => r.url().endsWith('/api/daily/shares') && r.method() === 'POST');
    await menu.locator('[data-format="long"]').click();
    await expect(menu).toBeHidden();
    await expect(game.shareCopiedButton).toBeVisible();
    expect((await counted).postDataJSON()).toEqual({ format: 'long' });

    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareTextProblems(clipText, 5, 'long')).toEqual([]);
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
    expect(shareTextProblems(copied, 5)).toEqual([]);
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
    await simulatePhoneShareMenu(page);
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await game.finishGame(new BlindRoundPage(page), 5);
    await game.shareButton.click();

    const shared = await sharedTexts(page);
    expect(shared).toHaveLength(1);
    expect(shareTextProblems(shared[0], 5)).toEqual([]);
    // Le menu du téléphone suffit : pas de « Copié ! ».
    await expect(game.shareCopiedButton).not.toBeVisible();
  });

  test('le format détaillé choisi par ▾ ouvre aussi le menu du téléphone, dans le geste', async ({ page }) => {
    await simulatePhoneShareMenu(page);
    const game = new GamePage(page);
    await game.startWithFakeClock();
    await game.finishGame(new BlindRoundPage(page), 5);
    await page.getByTestId('share-format-toggle').click();
    await page.getByTestId('share-format-menu').locator('[data-format="long"]').click();

    await expect.poll(() => sharedTexts(page)).toHaveLength(1);
    expect(shareTextProblems((await sharedTexts(page))[0], 5, 'long')).toEqual([]);
    await expect(game.shareCopiedButton).not.toBeVisible();
  });
});

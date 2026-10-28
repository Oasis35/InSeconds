import { test, expect } from '../fixtures/test';

/** `aaaa-mm-jj` du jour de jeu (UTC), décalé de `days` jours. */
const gameDay = (days = 0) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
};

test.describe('Réponses des jours passés', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('/daily/archive ouvre le dernier jour publié, ses morceaux, et jamais le jour même', async ({ page }) => {
    await page.goto('/daily/archive');

    await expect(page).toHaveURL(/\/daily\/archive\/\d{4}-\d{2}-\d{2}$/);
    const shown = page.url().slice(-10);
    expect(shown < gameDay()).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Blind test du');
    await expect(page.getByTestId('archive-track').first()).toBeVisible();
    // Le pool de test n'a aucune partie : moins de 5 joueurs, pas de statistiques, aucun « Toi ».
    await expect(page.getByTestId('archive-too-few')).toBeVisible();
    await expect(page.getByTestId('archive-players')).toHaveCount(0);
    await expect(page.getByTestId('archive-mine')).toHaveCount(0);
    await expect(page).toHaveTitle(/^Blind test du .+ : /);

    // Le jour même n'est pas publié.
    await page.goto(`/daily/archive/${gameDay()}`);
    await expect(page.getByTestId('archive-not-found')).toBeVisible();
  });

  test("l'accueil y mène par « Réponses des jours passés », en bas de l'écran (plus de calendrier dans l'en-tête)", async ({ page }) => {
    await page.goto('/daily');
    await expect(page.getByRole('button', { name: 'Commencer' })).toBeVisible();
    await expect(page.locator('app-account-link a[href="/daily/archive"]')).toHaveCount(0);

    await page.getByRole('link', { name: 'Réponses des jours passés' }).click();
    await expect(page).toHaveURL(/\/daily\/archive\/\d{4}-\d{2}-\d{2}$/);
  });

  test('les flèches sont de vrais liens et le calendrier ouvre un autre jour', async ({ page }) => {
    await page.goto('/daily/archive');
    await expect(page).toHaveURL(/\/daily\/archive\/\d{4}-\d{2}-\d{2}$/);
    const latest = page.url().slice(-10);

    const previous = page.getByTestId('archive-previous');
    await expect(previous).toHaveAttribute('href', /\/daily\/archive\/\d{4}-\d{2}-\d{2}$/);
    await previous.click();
    await expect(page).not.toHaveURL(new RegExp(`${latest}$`));
    await expect(page.getByTestId('archive-next')).toHaveAttribute('href', `/daily/archive/${latest}`);

    await page.getByTestId('archive-date').click();
    await page.getByTestId('archive-calendar').locator(`[data-date="${latest}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/daily/archive/${latest}$`));

    await page.getByTestId('archive-play-today').click();
    await expect(page).toHaveURL(/\/daily$/);
  });

  test("un morceau s'écoute dans la fenêtre de l'admin, et son nom se déplie au toucher", async ({ page }) => {
    await page.goto('/daily/archive');
    const track = page.getByTestId('archive-track').first();
    const text = track.getByTestId('archive-track-text');

    await expect(text).toHaveAttribute('aria-expanded', 'false');
    await text.click();
    await expect(text).toHaveAttribute('aria-expanded', 'true');
    await text.click();
    await expect(text).toHaveAttribute('aria-expanded', 'false');

    // Une adresse d'extrait neuve, demandée à l'ouverture de la fenêtre.
    const preview = page.waitForResponse(r => /\/api\/daily\/archive\/[\d-]+\/tracks\/1\/preview$/.test(r.url()) && r.ok());
    await track.getByTestId('archive-listen').click();
    await preview;
    await expect(page.getByTestId('preview-toggle')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('preview-toggle')).toHaveCount(0);
  });
});

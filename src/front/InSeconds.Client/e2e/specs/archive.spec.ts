import { test, expect } from '../fixtures/test';

/** `aaaa-mm-jj` du jour de jeu (UTC), décalé de `days` jours. */
const gameDay = (days = 0) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
};

test.describe('Historique et réponses des jours passés', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('/history/daily/latest ouvre le dernier jour publié, ses morceaux, et jamais le jour même', async ({ page }) => {
    await page.goto('/history/daily/latest');

    await expect(page).toHaveURL(/\/history\/daily\/\d{4}-\d{2}-\d{2}$/);
    const shown = page.url().slice(-10);
    expect(shown < gameDay()).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Blind test du');
    await expect(page.getByTestId('archive-track').first()).toBeVisible();
    // Le pool de test n'a aucune partie : moins de 5 joueurs, pas de statistiques, aucun « Toi ».
    await expect(page.getByTestId('archive-too-few')).toBeVisible();
    await expect(page.getByTestId('archive-players')).toHaveCount(0);
    await expect(page.getByTestId('archive-mine-summary')).toHaveCount(0);
    // Un jour qu'il n'a pas joué : les réponses s'affichent d'office.
    await expect(page.getByTestId('archive-not-played')).toBeVisible();
    await expect(page).toHaveTitle(/^Blind test du .+ : /);

    // Le jour même n'est pas publié.
    await page.goto(`/history/daily/${gameDay()}`);
    await expect(page.getByTestId('archive-not-found')).toBeVisible();
  });

  test("l'historique s'ouvre sur le calendrier du mois ; la page d'un jour y ramène, au bon mois", async ({ page }) => {
    await page.goto('/history/daily');
    await expect(page.getByTestId('history-calendar')).toBeVisible();
    await expect(page.getByTestId('history-month-stats')).toBeVisible();
    await expect(page.getByTestId('history-replay')).toHaveAttribute('href', '/history/daily/a-reecouter');

    await page.goto('/history/daily/latest');
    await expect(page).toHaveURL(/\/history\/daily\/\d{4}-\d{2}-\d{2}$/);
    const shown = page.url().slice(-10);
    await page.getByTestId('archive-back').click();
    await expect(page).toHaveURL(new RegExp(`/history/daily\\?mois=${shown.slice(0, 7)}$`));
    await expect(page.getByTestId(`history-day-${shown}`)).toHaveAttribute('href', `/history/daily/${shown}`);
  });

  test("« À réécouter » et le profil d'oreille, sans partie jouée", async ({ page }) => {
    await page.goto('/history/daily/a-reecouter');
    await expect(page.getByTestId('replay-empty')).toBeVisible();

    await page.goto('/history/daily/profil');
    await expect(page.getByTestId('profile-empty')).toBeVisible();
    await page.getByTestId('profile-period-all').click();
    await expect(page.getByTestId('profile-period-all')).toHaveAttribute('aria-pressed', 'true');
  });

  test("les flèches sont de vrais liens, et « Jouer le défi du jour » tant qu'il reste à jouer", async ({ page }) => {
    await page.goto('/history/daily/latest');
    await expect(page).toHaveURL(/\/history\/daily\/\d{4}-\d{2}-\d{2}$/);
    const latest = page.url().slice(-10);

    const previous = page.getByTestId('archive-previous');
    await expect(previous).toHaveAttribute('href', /\/history\/daily\/\d{4}-\d{2}-\d{2}$/);
    await previous.click();
    await expect(page).not.toHaveURL(new RegExp(`${latest}$`));
    await expect(page.getByTestId('archive-next')).toHaveAttribute('href', `/history/daily/${latest}`);
    await page.getByTestId('archive-next').click();
    await expect(page).toHaveURL(new RegExp(`/history/daily/${latest}$`));

    await page.getByTestId('archive-play-today').click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("un morceau se déplie au toucher et s'écoute sur place, avec une adresse neuve", async ({ page }) => {
    await page.goto('/history/daily/latest');
    const track = page.getByTestId('archive-track').first();
    const toggle = track.getByTestId('archive-track-toggle');

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(track.getByTestId('archive-track-detail')).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const preview = page.waitForResponse(r => /\/api\/daily\/archive\/[\d-]+\/tracks\/1\/preview$/.test(r.url()) && r.ok());
    await track.getByTestId('archive-listen').click();
    await preview;
    await expect(track.getByTestId('archive-listen')).toHaveAttribute('aria-label', 'Mettre en pause');
    await track.getByTestId('archive-listen').click();
    await expect(track.getByTestId('archive-listen')).toHaveAttribute('aria-label', /^Écouter /);

    await toggle.click();
    await expect(track.getByTestId('archive-track-detail')).toHaveCount(0);
  });
});

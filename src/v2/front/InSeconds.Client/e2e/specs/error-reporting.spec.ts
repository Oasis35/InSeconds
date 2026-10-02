import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

// Erreur serveur : l'écran d'erreur affiche le code d'erreur (traceId du ProblemDetails renvoyé
// par l'API) et le front remonte l'échec à POST /api/client-errors avec ce même code, pour
// relier les deux côtés dans l'outil d'observabilité.
test.describe("Remontée d'erreurs", () => {
  const traceId = '0123456789abcdef0123456789abcdef';

  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test("affiche le code d'erreur et remonte l'échec à l'API", async ({ page }) => {
    await page.route('**/api/sessions/today', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'An error occurred while processing your request.', status: 500, traceId }),
      }),
    );
    const report = page.waitForRequest(
      (r) => r.url().endsWith('/api/client-errors') && r.method() === 'POST',
    );

    const game = new GamePage(page);
    await game.goto();

    await expect(page.getByText('Une erreur est survenue')).toBeVisible();
    await expect(page.getByTestId('error-code')).toContainText(traceId);

    const body = (await report).postDataJSON();
    expect(body).toMatchObject({ source: 'http', httpStatus: 500, relatedTraceId: traceId });
  });

  test("une vraie exception serveur renvoie un code d'erreur lisible", async ({ request }) => {
    // Sans passer par le front : le gestionnaire d'erreurs global de l'API (endpoint Testing).
    const resp = await request.get('/api/e2e/throw');

    expect(resp.status()).toBe(500);
    expect((await resp.json()).traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});

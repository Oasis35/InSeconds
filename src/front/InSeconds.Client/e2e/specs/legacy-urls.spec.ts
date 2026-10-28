import { test, expect } from '../fixtures/test';
import { inSequence } from '../fixtures/sequence';
import { GamePage } from '../pages/game.page';
import { linkAccount } from '../pages/login.page';

// Anciennes adresses : les routes vivent sous /daily et /account, les liens
// déjà partagés, mis en favori ou envoyés par email doivent rester valables, query string comprise.

/** `?…` des adresses testées : un paramètre quelconque, qui doit survivre à la redirection. */
const QUERY = '?utm_source=e2e&x=1';

const escape = (s: string) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const endsWith = (path: string) => new RegExp(`${escape(path)}$`);

test.describe('Anciennes adresses (v2)', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('redirige les anciennes adresses vers les routes v2 en gardant la query string', async ({ page }) => {
    const cases: [from: string, to: string][] = [
      [`/${QUERY}`, `/daily${QUERY}`],
      [`/blindtest${QUERY}`, `/daily${QUERY}`],
      [`/login${QUERY}`, `/account/login${QUERY}`],
      ['/login/verify?token=jeton-e2e', '/account/login/verify?token=jeton-e2e'],
      ['/profile/confirm-email?token=jeton-e2e', '/account/confirm-email?token=jeton-e2e'],
      [`/confidentialite${QUERY}`, `/privacy${QUERY}`],
    ];
    await inSequence(cases, async ([from, to]) => {
      await page.goto(from);
      await expect(page, `${from} → ${to}`).toHaveURL(endsWith(to));
    });

    // Le jeton du lien magique arrive bien à la page de vérification (rien n'est consommé avant « Confirmer », piège 21).
    await page.goto('/login/verify?token=jeton-e2e');
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page.getByText('Ce lien est invalide ou a expiré.')).toBeVisible();
  });

  test('/profile mène au profil d\'un compte connecté, query string comprise', async ({ page, api }) => {
    await linkAccount(page, api, 'anciennes-adresses@e2e.test', 'AdressesE2E');

    await page.goto(`/profile${QUERY}`);
    await expect(page).toHaveURL(endsWith(`/account/profile${QUERY}`));
    await expect(page.getByPlaceholder('Ton pseudo')).toBeVisible();
  });

  test('l\'avis from=legacy s\'affiche une fois, puis le paramètre disparaît de l\'adresse', async ({ page }) => {
    const game = new GamePage(page);
    const notice = page.getByRole('heading', { name: "L'adresse a changé" });

    await page.goto(`/${QUERY}&from=legacy`);
    await expect(notice).toBeVisible();
    // Le paramètre est retiré avant la première navigation : les autres restent, la redirection / → /daily a lieu.
    await expect(page).toHaveURL(endsWith(`/daily${QUERY}`));

    await page.getByRole('button', { name: "J'ai compris" }).click();
    await expect(notice).toBeHidden();
    await expect(game.startButton).toBeVisible();

    // Au rechargement, plus de from=legacy dans l'adresse : l'avis ne revient pas.
    await page.reload();
    await expect(game.startButton).toBeVisible();
    await expect(notice).toBeHidden();
    await expect(page).toHaveURL(endsWith(`/daily${QUERY}`));
  });
});

import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

const WHITELISTED_EMAIL = 'allowed@e2e.test';

// La whitelist e2e (Features/E2E/ResetEndpoint.SeedData) pré-autorise
// allowed@e2e.test — pas besoin de passer par l'onglet admin.

async function requestMagicLink(page: import('@playwright/test').Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('ton@email.com').fill(email);
  await page.getByRole('button', { name: 'Recevoir un lien' }).click();
  await expect(page.getByText('un lien de connexion vient de lui être envoyé')).toBeVisible();
}

// L'URL du lien magique est générée avec App:PublicUrl (fixe, ne suit pas forcément le
// port réel du front local vs CI) — on ne navigue que sur le chemin+query, jamais l'origine.
function pathOf(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

test.describe('Connexion par lien magique', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('parcours complet : email whitelisté -> lien -> pseudo -> connecté', async ({ page, api }) => {
    await requestMagicLink(page, WHITELISTED_EMAIL);

    const linkUrl = await api.getLastMagicLinkUrl(WHITELISTED_EMAIL);
    await page.goto(pathOf(linkUrl));

    await page.getByRole('button', { name: 'Confirmer la connexion' }).click();

    // Première connexion pour cet email -> pas encore de compte -> choix du pseudo
    await expect(page.getByRole('heading', { name: 'Choisis ton pseudo' })).toBeVisible();
    await page.getByPlaceholder('Ton pseudo').fill('AliceE2E');
    await page.getByRole('button', { name: 'Valider' }).click();

    const game = new GamePage(page);
    await game.waitForWelcome();
    await expect(page.getByTitle(/AliceE2E · Se déconnecter/)).toBeVisible();
  });

  test('email non whitelisté : message générique identique, aucun lien à récupérer', async ({ page, api }) => {
    await requestMagicLink(page, 'inconnu@e2e.test');

    await expect(api.getLastMagicLinkUrl('inconnu@e2e.test')).rejects.toThrow();
  });

  test('lien invalide affiche une erreur avec un retour vers /login', async ({ page }) => {
    await page.goto('/login/verify?token=un-token-qui-nexiste-pas');
    await page.getByRole('button', { name: 'Confirmer la connexion' }).click();

    await expect(page.getByText('Ce lien est invalide ou a expiré.')).toBeVisible();
    await page.getByRole('link', { name: '← Demander un nouveau lien' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('reconnexion depuis un autre appareil résout le même compte', async ({ page, api, browser }) => {
    // Appareil A : première connexion, crée le compte.
    await requestMagicLink(page, WHITELISTED_EMAIL);
    let linkUrl = await api.getLastMagicLinkUrl(WHITELISTED_EMAIL);
    await page.goto(pathOf(linkUrl));
    await page.getByRole('button', { name: 'Confirmer la connexion' }).click();
    await page.getByPlaceholder('Ton pseudo').fill('BobE2E');
    await page.getByRole('button', { name: 'Valider' }).click();
    const gameA = new GamePage(page);
    await gameA.waitForWelcome();

    // Appareil B : nouveau contexte Playwright, aucun cookie partagé avec A. Ce contexte
    // ne passe pas par le fixture `page` (cf. e2e/fixtures/test.ts) qui force lang=fr —
    // sans ça, la locale par défaut du navigateur (souvent en anglais en CI) ferait
    // échouer les sélecteurs de texte français ci-dessous.
    const contextB = await browser.newContext();
    await contextB.addInitScript(() => {
      try {
        localStorage.setItem('lang', 'fr');
      } catch {
        // localStorage indisponible — ignore
      }
    });
    const pageB = await contextB.newPage();
    await requestMagicLink(pageB, WHITELISTED_EMAIL);
    linkUrl = await api.getLastMagicLinkUrl(WHITELISTED_EMAIL);
    await pageB.goto(pathOf(linkUrl));
    await pageB.getByRole('button', { name: 'Confirmer la connexion' }).click();

    // Compte déjà lié -> pas de nouveau prompt pseudo, résolution directe.
    const gameB = new GamePage(pageB);
    await gameB.waitForWelcome();
    await expect(pageB.getByTitle(/BobE2E · Se déconnecter/)).toBeVisible();

    await contextB.close();
  });

  test('déconnexion depuis le footer revient à l\'état guest', async ({ page, api }) => {
    await requestMagicLink(page, WHITELISTED_EMAIL);
    const linkUrl = await api.getLastMagicLinkUrl(WHITELISTED_EMAIL);
    await page.goto(pathOf(linkUrl));
    await page.getByRole('button', { name: 'Confirmer la connexion' }).click();
    await page.getByPlaceholder('Ton pseudo').fill('CarlE2E');
    await page.getByRole('button', { name: 'Valider' }).click();

    const game = new GamePage(page);
    await game.waitForWelcome();

    await page.getByTitle(/CarlE2E · Se déconnecter/).click();

    await expect(page.getByTitle('Se connecter')).toBeVisible();
  });
});

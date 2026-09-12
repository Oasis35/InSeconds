import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';

const TEST_EMAIL = 'testeur@e2e.test';

async function requestMagicLink(page: import('@playwright/test').Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('ton@email.com').fill(email);
  await page.getByRole('button', { name: 'Recevoir un lien' }).click();
  await expect(page.getByText('un lien de connexion vient de t\'être envoyé')).toBeVisible();
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

  test('parcours complet : nimporte quel email -> lien -> pseudo -> connecté', async ({ page, api }) => {
    await requestMagicLink(page, TEST_EMAIL);

    const linkUrl = await api.getLastMagicLinkUrl(TEST_EMAIL);
    await page.goto(pathOf(linkUrl));

    await page.getByRole('button', { name: 'Confirmer la connexion' }).click();

    // Première connexion pour cet email -> pas encore de compte -> choix du pseudo
    await expect(page.getByRole('heading', { name: 'Choisis ton pseudo' })).toBeVisible();
    await page.getByPlaceholder('Ton pseudo').fill('AliceE2E');
    await page.getByRole('button', { name: 'Valider' }).click();

    const game = new GamePage(page);
    await game.waitForWelcome();
    // Le pseudo apparaît à la fois sur l'avatar du header et sur l'icône du footer
    // (même `title`) — scoper au header pour éviter la violation "strict mode".
    await expect(page.locator('app-game-header').getByTitle('AliceE2E')).toBeVisible();
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
    await requestMagicLink(page, TEST_EMAIL);
    let linkUrl = await api.getLastMagicLinkUrl(TEST_EMAIL);
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
    await requestMagicLink(pageB, TEST_EMAIL);
    linkUrl = await api.getLastMagicLinkUrl(TEST_EMAIL);
    await pageB.goto(pathOf(linkUrl));
    await pageB.getByRole('button', { name: 'Confirmer la connexion' }).click();

    // Compte déjà lié -> pas de nouveau prompt pseudo, résolution directe.
    const gameB = new GamePage(pageB);
    await gameB.waitForWelcome();
    await expect(pageB.locator('app-game-header').getByTitle('BobE2E')).toBeVisible();

    await contextB.close();
  });

  test('déconnexion depuis le footer revient à l\'état guest', async ({ page, api }) => {
    await requestMagicLink(page, TEST_EMAIL);
    const linkUrl = await api.getLastMagicLinkUrl(TEST_EMAIL);
    await page.goto(pathOf(linkUrl));
    await page.getByRole('button', { name: 'Confirmer la connexion' }).click();
    await page.getByPlaceholder('Ton pseudo').fill('CarlE2E');
    await page.getByRole('button', { name: 'Valider' }).click();

    const game = new GamePage(page);
    await game.waitForWelcome();

    // Le clic sur l'icône du footer ouvre l'écran Profil (plus de déconnexion
    // directe) — il faut confirmer explicitement via son bouton "Se déconnecter".
    // Le header a aussi un avatar portant le même `title` : scoper au footer.
    await page.locator('app-game-footer').getByTitle('CarlE2E').click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page.getByText('Se déconnecter ?')).toBeVisible();
    await page.getByRole('button', { name: 'Oui, me déconnecter' }).click();

    await game.waitForWelcome();
    await expect(page.getByTitle('Se connecter')).toBeVisible();
  });
});

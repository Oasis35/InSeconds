import { test, expect } from '../fixtures/test';
import { expectSignedIn, linkAccount, pathOf } from '../pages/login.page';

const TEST_EMAIL = 'testeur@e2e.test';

async function requestMagicLink(page: import('@playwright/test').Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('ton@email.com').fill(email);
  await page.getByRole('button', { name: 'Recevoir le lien' }).click();
  await expect(page.getByText('Lien envoyé.')).toBeVisible();
}

test.describe('Connexion par lien magique', () => {
  test.beforeEach(async ({ api }) => {
    await api.reset();
  });

  test('parcours complet : nimporte quel email -> lien -> pseudo -> connecté', async ({ page, api }) => {
    await requestMagicLink(page, TEST_EMAIL);

    const linkUrl = await api.getLastMagicLinkUrl(TEST_EMAIL);
    await page.goto(pathOf(linkUrl));

    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();

    // Première connexion pour cet email -> pas encore de compte -> choix du pseudo
    await expect(page.getByRole('heading', { name: 'Choisis ton pseudo' })).toBeVisible();
    await page.getByPlaceholder('Ton pseudo').fill('AliceE2E');
    await page.getByRole('button', { name: 'Valider' }).click();

    await expectSignedIn(page, 'AliceE2E');
  });

  test('lien invalide affiche une erreur avec un retour vers /login', async ({ page }) => {
    await page.goto('/login/verify?token=un-token-qui-nexiste-pas');
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();

    await expect(page.getByText('Ce lien est invalide ou a expiré.')).toBeVisible();
    await page.getByRole('link', { name: 'Retour à la connexion' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('reconnexion depuis un autre appareil résout le même compte', async ({ page, api, browser }) => {
    // Appareil A : première connexion, crée le compte.
    await requestMagicLink(page, TEST_EMAIL);
    let linkUrl = await api.getLastMagicLinkUrl(TEST_EMAIL);
    await page.goto(pathOf(linkUrl));
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await page.getByPlaceholder('Ton pseudo').fill('BobE2E');
    await page.getByRole('button', { name: 'Valider' }).click();
    await expectSignedIn(page, 'BobE2E');

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
    await pageB.getByRole('button', { name: 'Confirmer', exact: true }).click();

    // Compte déjà lié -> pas de nouveau prompt pseudo, résolution directe.
    await expectSignedIn(pageB, 'BobE2E');

    await contextB.close();
  });

  test('déjà connecté, un lien pour une autre adresse crée un autre compte sans modifier le premier', async ({ page, api }) => {
    const OTHER_EMAIL = 'autre@e2e.test';
    await linkAccount(page, api, TEST_EMAIL, 'ProprioE2E');

    // Toujours connecté : on ouvre un lien envoyé à une autre adresse.
    await requestMagicLink(page, OTHER_EMAIL);
    await page.goto(pathOf(await api.getLastMagicLinkUrl(OTHER_EMAIL)));
    await expect(page.getByText(`Tu es déjà connecté avec ${TEST_EMAIL}.`)).toBeVisible();

    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(page.getByText(`Ton compte actuel (${TEST_EMAIL}) ne sera pas modifié.`)).toBeVisible();
    await page.getByPlaceholder('Ton pseudo').fill('AutreE2E');
    await page.getByRole('button', { name: 'Valider' }).click();

    await expectSignedIn(page, 'AutreE2E');

    // Le premier compte est intact : se reconnecter avec sa propre adresse le retrouve, pseudo compris.
    await requestMagicLink(page, TEST_EMAIL);
    await page.goto(pathOf(await api.getLastMagicLinkUrl(TEST_EMAIL)));
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expectSignedIn(page, 'ProprioE2E');
  });

  test('déconnexion depuis le profil revient à l\'état guest', async ({ page, api }) => {
    await requestMagicLink(page, TEST_EMAIL);
    const linkUrl = await api.getLastMagicLinkUrl(TEST_EMAIL);
    await page.goto(pathOf(linkUrl));
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await page.getByPlaceholder('Ton pseudo').fill('CarlE2E');
    await page.getByRole('button', { name: 'Valider' }).click();

    await expectSignedIn(page, 'CarlE2E');

    // Le clic sur l'avatar du header ouvre l'écran Profil (plus de déconnexion
    // directe) — il faut confirmer explicitement via son bouton "Se déconnecter".
    await page.locator('app-account-link').getByTitle('CarlE2E').click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    await expect(page.getByText('Se déconnecter ?')).toBeVisible();
    // Même libellé que le bouton du profil : la confirmation du panneau est rendue après lui.
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).last().click();

    // Revenu à l'état guest : l'en-tête propose de se connecter (l'écran d'accueil du jeu arrive avec Daily).
    await expect(page.locator('app-account-link').getByRole('link', { name: 'Se connecter' })).toBeVisible();
  });
});

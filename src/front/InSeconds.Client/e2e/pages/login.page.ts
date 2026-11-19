import { Browser, Page } from '@playwright/test';
import { expect } from '../fixtures/test';
import { ApiTestClient } from '../fixtures/api-client';

/** L'URL du lien magique est générée avec App:PublicUrl (fixe, ne suit pas forcément le
 * port réel du front local vs CI) - on ne navigue que sur le chemin+query, jamais l'origine. */
export function pathOf(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

/**
 * Attend qu'un compte soit connecté dans ce navigateur : sur l'accueil, l'onglet « Mon compte » de la barre du bas mène au profil (un invité y a « Connexion »).
 * Le profil affiche le pseudo, c'est lui qu'on lit.
 */
export async function expectSignedIn(page: Page, pseudo: string): Promise<void> {
  // La connexion se termine sur la page en cours (le pseudo part au serveur) : on n'en sort qu'une fois le compte lié, vu par la barre du bas de l'accueil.
  await expect(page.getByTestId('tab-account')).toHaveAttribute('href', '/account/profile');
  await page.getByTestId('tab-account').click();
  await expect(page.getByPlaceholder('Ton pseudo')).toHaveValue(pseudo);
}

/**
 * Parcours complet de connexion par magic link, jusqu'au choix du pseudo (première
 * connexion). Mutualisé entre change-email.spec.ts et profile.spec.ts.
 */
export async function linkAccount(page: Page, api: ApiTestClient, email: string, pseudo: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('ton@email.com').fill(email);
  await page.getByRole('button', { name: 'Recevoir le lien' }).click();
  // Le clic ne fait que déclencher la requête HTTP asynchrone - attendre la confirmation
  // affichée avant d'interroger le backend, sinon on peut arriver avant que l'email soit
  // réellement capturé.
  await expect(page.getByText('On a envoyé un lien à')).toBeVisible();

  const linkUrl = await api.getLastMagicLinkUrl(email);
  await page.goto(pathOf(linkUrl));
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  // Adresse sans compte : l'étape « Nouveau compte » précède le pseudo.
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.getByPlaceholder('Ton pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Valider' }).click();
  // Attendre que la connexion/conversion de compte soit réellement terminée côté serveur
  // avant de rendre la main : un context.close() (cf. tests multi-comptes) juste après
  // annulerait sinon la requête de vérification (avec pseudo) encore en vol, laissant le
  // compte jamais réellement créé avec son email - bug constaté (VerifyMagicLinkCommand
  // annulé en CI/local, "email déjà pris" jamais détecté côté second compte).
  await expectSignedIn(page, pseudo);
}

/**
 * Un second appareil : un nouveau contexte de navigateur (aucun cookie partagé), en français comme le fixture `page`.
 * À fermer par l'appelant (`page.context().close()`).
 */
export async function openOtherDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      localStorage.setItem('lang', 'fr');
    } catch {
      // localStorage indisponible - ignore
    }
  });
  return context.newPage();
}

/** Reconnexion d'un compte existant par lien magique (pas d'étape pseudo) : un nouvel appareil pour ce compte. */
export async function signInAgain(page: Page, api: ApiTestClient, email: string, pseudo: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('ton@email.com').fill(email);
  await page.getByRole('button', { name: 'Recevoir le lien' }).click();
  await expect(page.getByText('On a envoyé un lien à')).toBeVisible();

  const linkUrl = await api.getLastMagicLinkUrl(email);
  await page.goto(pathOf(linkUrl));
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expectSignedIn(page, pseudo);
}

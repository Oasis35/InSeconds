import { Page } from '@playwright/test';
import { expect } from '../fixtures/test';
import { ApiTestClient } from '../fixtures/api-client';
import { GamePage } from './game.page';

/** L'URL du lien magique est générée avec App:PublicUrl (fixe, ne suit pas forcément le
 * port réel du front local vs CI) — on ne navigue que sur le chemin+query, jamais l'origine. */
export function pathOf(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

/**
 * Parcours complet de connexion par magic link, jusqu'au choix du pseudo (première
 * connexion). Mutualisé entre change-email.spec.ts et profile.spec.ts.
 */
export async function linkAccount(page: Page, api: ApiTestClient, email: string, pseudo: string): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('ton@email.com').fill(email);
  await page.getByRole('button', { name: 'Recevoir le lien' }).click();
  // Le clic ne fait que déclencher la requête HTTP asynchrone — attendre la confirmation
  // affichée avant d'interroger le backend, sinon on peut arriver avant que l'email soit
  // réellement capturé.
  await expect(page.getByText('Lien envoyé.')).toBeVisible();

  const linkUrl = await api.getLastMagicLinkUrl(email);
  await page.goto(pathOf(linkUrl));
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByPlaceholder('Ton pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Valider' }).click();
  // Attendre que la connexion/conversion de compte soit réellement terminée côté serveur
  // avant de rendre la main : un context.close() (cf. tests multi-comptes) juste après
  // annulerait sinon la requête VerifyMagicLink (avec pseudo) encore en vol, laissant le
  // compte jamais réellement créé avec son email — bug constaté (VerifyMagicLinkCommand
  // annulé en CI/local, "email déjà pris" jamais détecté côté second compte).
  await new GamePage(page).waitForWelcome();
}

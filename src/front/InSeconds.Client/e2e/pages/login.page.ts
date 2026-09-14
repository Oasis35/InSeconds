import { Page } from '@playwright/test';
import { expect } from '../fixtures/test';
import { ApiTestClient } from '../fixtures/api-client';

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
  await page.getByRole('button', { name: 'Recevoir un lien' }).click();
  // Le clic ne fait que déclencher la requête HTTP asynchrone — attendre la confirmation
  // affichée avant d'interroger le backend, sinon on peut arriver avant que l'email soit
  // réellement capturé.
  await expect(page.getByText('un lien de connexion vient de t\'être envoyé')).toBeVisible();

  const linkUrl = await api.getLastMagicLinkUrl(email);
  await page.goto(pathOf(linkUrl));
  await page.getByRole('button', { name: 'Confirmer la connexion' }).click();
  await page.getByPlaceholder('Ton pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Valider' }).click();
}

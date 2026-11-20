import type { Page } from '@playwright/test';
import { BASE } from './api-client';

/** Connecte la page comme un compte joueur ordinaire (créé au besoin, `POST /api/auth/dev-login`) et rend son identifiant. */
export async function loginAsPlayer(page: Page, email: string, pseudo: string): Promise<string> {
  const res = await page.request.post(`${BASE}/api/auth/dev-login`, { data: { email, pseudo } });
  if (!res.ok()) throw new Error(`dev-login failed: ${res.status()}`);
  const me = await page.request.get(`${BASE}/api/players/me`);
  return ((await me.json()) as { playerId: string }).playerId;
}

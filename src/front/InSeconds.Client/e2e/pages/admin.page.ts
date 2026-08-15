import { Page, Locator } from '@playwright/test';

const BASE = process.env['CI'] ? 'http://localhost:5171' : 'http://localhost:5172';

export class AdminPage {
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly loginError: Locator;
  readonly logoutButton: Locator;

  constructor(readonly page: Page) {
    this.passwordInput = page.getByPlaceholder('Mot de passe admin');
    this.loginButton   = page.getByRole('button', { name: 'Se connecter' });
    this.loginError    = page.getByText('Mot de passe incorrect');
    this.logoutButton  = page.getByRole('button', { name: 'Se déconnecter' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin');
  }

  async login(password = 'e2e-admin-password'): Promise<void> {
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.logoutButton.waitFor({ state: 'visible' });
  }

  tab(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  async clickTab(name: string): Promise<void> {
    await this.tab(name).click();
  }

  // Pool
  poolSearchInput(): Locator {
    return this.page.getByPlaceholder('Rechercher artiste ou titre...');
  }

  poolFilterPreview(): Locator {
    return this.page.locator('select').filter({ hasText: 'Toutes les previews' });
  }

  poolFilterStatus(): Locator {
    return this.page.locator('select').filter({ hasText: 'Tous les statuts' });
  }

  addButton(): Locator {
    return this.page.getByRole('button', { name: '+ Ajouter' });
  }

  poolFilterLastUsedFrom(): Locator {
    return this.page.getByLabel('Utilisé depuis le');
  }

  poolFilterLastUsedTo(): Locator {
    return this.page.getByLabel('Utilisé jusqu\'au');
  }

  poolColumnHeader(name: string): Locator {
    return this.page.getByRole('columnheader', { name: new RegExp(name) });
  }

  poolRow(artist: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name: artist, exact: true }) });
  }

  // Actions — cooldown
  trackCooldownInput(): Locator {
    return this.page.getByLabel('Cooldown de réutilisation des morceaux');
  }

  saveCooldownButton(): Locator {
    return this.page.getByRole('button', { name: 'Enregistrer' });
  }

  // Modale ajout (placeholder distinct du filtre pool)
  modalSearchInput(): Locator {
    return this.page.getByPlaceholder('Rechercher sur Deezer...');
  }

  modalAddAndCloseButton(): Locator {
    return this.page.getByRole('button', { name: 'Ajouter et fermer' });
  }

  modalUpdateAndCloseButton(): Locator {
    return this.page.getByRole('button', { name: 'Actualiser et fermer' });
  }

  // Suppression
  deleteModal(): Locator {
    return this.page.getByText('Confirmer la suppression');
  }

  confirmDeleteButton(): Locator {
    return this.page.getByRole('button', { name: 'Supprimer' }).last();
  }

  cancelDeleteButton(): Locator {
    return this.page.getByRole('button', { name: 'Annuler' });
  }

  // Actions
  generateButton(): Locator {
    return this.page.getByRole('button', { name: /Générer le défi du jour/ });
  }

  resetButton(): Locator {
    return this.page.getByRole('button', { name: /Réinitialiser les parties du jour/ });
  }

  // Défis — bouton créer
  createChallengeButton(): Locator {
    return this.page.getByRole('button', { name: /Créer le défi|Générer/ }).first();
  }

  // Identifiant du navigateur (BrowserIdComponent) — visible sur l'écran de login et dans le shell.
  // Span (pas bouton) montrant les 8 premiers caractères du PlayerId (hex, sans tiret) — le
  // filtre de tag distingue ce span des chips joueurs de l'onglet Défis, qui sont des <button>.
  browserIdShort(): Locator {
    return this.page.locator('span.font-mono').filter({ hasText: /^[0-9a-f]{8}$/ });
  }

  browserIdCopyButton(): Locator {
    return this.page.getByRole('button', { name: /^Copier$|^Copié !$/ });
  }

  // Chip joueur dans "Stats par défi" (ChallengesTabComponent) — bouton contenant l'ID court.
  playerChip(shortId: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(shortId) });
  }

  // Ligne d'un défi précis dans "Stats par défi" (div.py-3 contenant la date en texte exact).
  challengeRow(dateIso: string): Locator {
    return this.page.locator('div.py-3').filter({ has: this.page.getByText(dateIso, { exact: true }) });
  }

  // Helpers API directs (évite de passer par l'UI pour le setup)
  async apiReseed(): Promise<void> {
    const res = await fetch(`${BASE}/api/e2e/reseed`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`reseed failed: ${res.status}`);
  }

  async apiDeleteTodayChallenge(): Promise<void> {
    await fetch(`${BASE}/api/e2e/reset?deleteChallenge=true`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer admin-token' },
    });
  }

  // GET /api/settings lit IOptions<AppSettings> figé au boot (pas de live-reload générique) —
  // seuls DailyChallengeGenerator/GetTracksHandler relisent la table Settings à chaud.
  // Pour vérifier la persistance, on repasse par le pool (dont les dates de déblocage sont
  // calculées avec la valeur fraîche de TrackCooldownDays).
  async apiGetPoolUnlockDate(deezerTrackId: number): Promise<string | null | undefined> {
    const res = await fetch(`${BASE}/api/admin/tracks`, {
      headers: { Authorization: 'Bearer admin-token' },
    });
    if (!res.ok) throw new Error(`get tracks failed: ${res.status}`);
    const body = await res.json() as { available: { deezerTrackId: number; unlockDate: string | null }[] };
    return body.available.find(t => t.deezerTrackId === deezerTrackId)?.unlockDate;
  }
}

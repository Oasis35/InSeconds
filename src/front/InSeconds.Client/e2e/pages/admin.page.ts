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

  async login(password = 'admin-token'): Promise<void> {
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

  // Modale ajout
  modalSearchInput(): Locator {
    return this.page.getByPlaceholder('Rechercher artiste ou titre...').nth(1);
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
}

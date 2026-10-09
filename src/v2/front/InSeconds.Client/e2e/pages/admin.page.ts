import { Page, Locator } from '@playwright/test';

const BASE = process.env['CI'] ? 'http://localhost:5175' : 'http://localhost:5177';
// L'auth admin est désormais un rôle sur le cookie joueur (Player.IsAdmin, cf. refonte
// profils admin) — plus d'OriginValidator sur ces routes, donc plus besoin d'Origin ici.

export class AdminPage {
  readonly logoutButton: Locator;
  readonly notLoggedInMessage: Locator;
  readonly accessDeniedMessage: Locator;
  readonly browserIdLabel: Locator;

  constructor(readonly page: Page) {
    this.logoutButton = page.getByRole('button', { name: 'Se déconnecter' });
    this.notLoggedInMessage = page.getByRole('heading', { name: "Connecte-toi d'abord" });
    this.accessDeniedMessage = page.getByRole('heading', { name: 'Accès refusé' });
    this.browserIdLabel = page.getByText('Ton identifiant navigateur :');
  }

  // Attend l'affichage de l'ID navigateur (BrowserIdComponent) : sans cookie, il appelle
  // GET /api/players/me sans peek, qui crée un invité et pose son cookie authToken. Tant que
  // cette réponse n'est pas revenue, un login() enchaîné juste derrière était instable : si
  // elle arrivait après POST /api/e2e/login-as-admin, son Set-Cookie écrasait le cookie admin
  // (course → /admin affichait « Connecte-toi d'abord », timeout sur « Se déconnecter »).
  // L'ID n'est rendu qu'une fois playerId résolu, donc aucun Set-Cookie ne reste en vol.
  async goto(): Promise<void> {
    await this.page.goto('/admin');
    await this.browserIdLabel.waitFor({ state: 'visible' });
  }

  // Raccourci E2E-only : crée/réutilise un compte lié dédié aux tests avec IsAdmin=true
  // et pose son cookie directement (POST /api/e2e/login-as-admin, cf. Features/E2E/ResetEndpoint.cs),
  // sans passer par le formulaire mot de passe qui n'existe plus. page.request partage le
  // cookie jar du contexte navigateur : le Set-Cookie de la réponse s'applique à `page`.
  async login(): Promise<void> {
    const res = await this.page.request.post(`${BASE}/api/e2e/login-as-admin`, {
      headers: { Authorization: 'Bearer admin-token' },
    });
    if (!res.ok()) throw new Error(`login-as-admin failed: ${res.status()}`);

    await this.page.goto('/admin');
    await this.logoutButton.waitFor({ state: 'visible' });
  }

  tab(name: string): Locator {
    return this.page.getByRole('link', { name, exact: true });
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

  // Panneau de recherche/ajout (bandeau intégré, placeholder distinct du filtre pool)
  addPanelSearchInput(): Locator {
    return this.page.getByPlaceholder('Rechercher sur Deezer...');
  }

  addPanelAddButton(): Locator {
    return this.page.getByRole('button', { name: 'Ajouter', exact: true });
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

  // Modification (artiste / titre)
  editModalTitle(): Locator {
    return this.page.getByRole('heading', { name: 'Modifier le morceau' });
  }

  editTitleInput(): Locator {
    return this.page.getByLabel('Titre', { exact: true });
  }

  editSaveButton(): Locator {
    return this.page.getByRole('button', { name: 'Enregistrer' });
  }

  // Actions : témoins du dernier passage des tâches planifiées
  challengeWitness(): Locator {
    return this.page.getByTestId('challenge-witness');
  }

  previewsWitness(): Locator {
    return this.page.getByTestId('previews-witness');
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

  // Les réglages sont relus à chaud (R13) : pour vérifier que le nouveau cooldown s'applique, on repasse par le pool, dont
  // les dates de déblocage sont calculées avec la valeur courante. La route exige le cookie admin : on passe par la requête
  // de la page, qui partage le cookie du navigateur (login() l'a posé).
  /** Les dates (aaaa-mm-jj) de tous les défis en base, par la route de l'historique (cookie admin de la page). */
  async apiGetChallengeDates(): Promise<string[]> {
    const res = await this.page.request.get(`${BASE}/api/admin/daily/challenges`);
    if (!res.ok()) throw new Error(`get challenges failed: ${res.status()}`);
    const challenges = await res.json() as { date: string }[];
    return challenges.map(c => c.date);
  }

  async apiGetPoolUnlockDate(deezerTrackId: number): Promise<string | null | undefined> {
    const res = await this.page.request.get(`${BASE}/api/admin/catalogue/tracks`);
    if (!res.ok()) throw new Error(`get tracks failed: ${res.status()}`);
    const tracks = await res.json() as { deezerTrackId: number; unlockDate: string | null }[];
    return tracks.find(t => t.deezerTrackId === deezerTrackId)?.unlockDate;
  }
}

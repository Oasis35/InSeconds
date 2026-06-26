import { Page, Locator } from '@playwright/test';

export class GamePage {
  readonly startButton: Locator;
  readonly noChallengeHeading: Locator;
  readonly alreadyPlayedHeading: Locator;
  readonly abandonedHeading: Locator;
  readonly countdown: Locator;
  readonly finalScoreLabel: Locator;
  readonly shareButton: Locator;
  readonly shareCopiedButton: Locator;
  readonly retryButton: Locator;
  // Reprise
  readonly resumePromptHeading: Locator;
  readonly resumeButton: Locator;
  readonly abandonButton: Locator;
  readonly abandonConfirmButton: Locator;
  // Confirmation de sortie (guard CanDeactivate)
  readonly leaveConfirmButton: Locator;
  readonly leaveCancelButton: Locator;

  constructor(readonly page: Page) {
    this.startButton           = page.getByRole('button', { name: 'Commencer' });
    this.noChallengeHeading    = page.getByText("Pas de défi aujourd'hui");
    this.alreadyPlayedHeading  = page.getByText('Déjà joué aujourd\'hui');
    this.abandonedHeading      = page.getByText("Tu as abandonné le défi aujourd'hui");
    this.countdown             = page.getByText(/^\d{2}:\d{2}:\d{2}$/);
    this.finalScoreLabel       = page.getByText('Score final');
    this.shareButton           = page.getByRole('button', { name: /Partager mon score/i });
    this.shareCopiedButton     = page.getByRole('button', { name: /Copié/i });
    this.retryButton           = page.getByRole('button', { name: 'Réessayer' });
    // Scopé sur le <h2> de l'écran reprise : le titre de la modale de sortie
    // porte le même texte "Partie en cours" mais est rendu dans un <p>.
    this.resumePromptHeading   = page.getByRole('heading', { name: 'Partie en cours' });
    this.resumeButton          = page.getByRole('button', { name: 'Reprendre' });
    this.abandonButton         = page.getByRole('button', { name: 'Abandonner' });
    this.abandonConfirmButton  = page.getByRole('button', { name: 'Oui, abandonner' });
    this.leaveConfirmButton    = page.getByRole('button', { name: 'Quitter quand même' });
    this.leaveCancelButton     = page.getByRole('button', { name: 'Continuer à jouer' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async waitForWelcome(): Promise<void> {
    await this.startButton.waitFor({ state: 'visible' });
  }

  async clickStart(): Promise<void> {
    await this.startButton.click();
  }

  async waitForDone(): Promise<void> {
    await this.finalScoreLabel.waitFor({ state: 'visible' });
  }

  async waitForResumePrompt(): Promise<void> {
    await this.resumePromptHeading.waitFor({ state: 'visible' });
  }
}

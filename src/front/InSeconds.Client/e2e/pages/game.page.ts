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
    this.resumePromptHeading   = page.getByText('Partie en cours');
    this.resumeButton          = page.getByRole('button', { name: 'Reprendre' });
    this.abandonButton         = page.getByRole('button', { name: 'Abandonner' });
    this.abandonConfirmButton  = page.getByRole('button', { name: 'Oui, abandonner' });
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

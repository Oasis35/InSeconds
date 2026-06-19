import { Page, Locator } from '@playwright/test';

export class GamePage {
  readonly startButton: Locator;
  readonly noChallengeHeading: Locator;
  readonly alreadyPlayedHeading: Locator;
  readonly countdown: Locator;
  readonly finalScoreLabel: Locator;
  readonly shareButton: Locator;
  readonly shareCopiedButton: Locator;
  readonly retryButton: Locator;

  constructor(readonly page: Page) {
    this.startButton        = page.getByRole('button', { name: 'Commencer' });
    this.noChallengeHeading = page.getByText("Pas de défi aujourd'hui");
    this.alreadyPlayedHeading = page.getByText('Déjà joué aujourd\'hui');
    this.countdown          = page.getByText(/^\d{2}:\d{2}:\d{2}$/);
    this.finalScoreLabel    = page.getByText('Score final');
    this.shareButton        = page.getByRole('button', { name: /Partager mon score/i });
    this.shareCopiedButton  = page.getByRole('button', { name: /Copié/i });
    this.retryButton        = page.getByRole('button', { name: 'Réessayer' });
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
}

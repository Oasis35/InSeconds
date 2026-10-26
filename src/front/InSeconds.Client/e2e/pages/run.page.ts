import { Page, Locator, expect } from '@playwright/test';
import { inSequence } from '../fixtures/sequence';
import type { RunTrack } from '../fixtures/api-client';

const BASE = process.env['CI'] ? 'http://localhost:5175' : 'http://localhost:5177';

/**
 * Le mode Run (« Platines », `/runs`) : l'accueil du mode, la manche (lecteur et saisie du jeu du jour, carte de réponse ou du morceau
 * retiré), le bilan de la manche et la fin. L'écoute est fixe (10 s) et la saisie est là dès que le son se charge : on répond sans attendre
 * la fin de l'extrait.
 */
export class RunPage {
  readonly homeCard: Locator;
  readonly welcome: Locator;
  readonly startButton: Locator;
  readonly answerInput: Locator;
  readonly submitButton: Locator;
  readonly confirmSubmitButton: Locator;
  readonly roundTitle: Locator;
  readonly totalScore: Locator;
  readonly position: Locator;
  readonly answerCard: Locator;
  readonly withdrawnCard: Locator;
  readonly nextTrackButton: Locator;
  readonly objectivePoints: Locator;
  readonly objectiveBefore: Locator;
  readonly roundEnd: Locator;
  readonly roundEndTitle: Locator;
  readonly objectiveLabel: Locator;
  readonly nextRoundButton: Locator;
  readonly finished: Locator;
  readonly disc: Locator;
  readonly record: Locator;
  readonly found: Locator;
  readonly roundScores: Locator;
  readonly playAgainButton: Locator;
  readonly resumeButton: Locator;

  constructor(readonly page: Page) {
    this.homeCard            = page.getByTestId('run-home-card');
    this.welcome             = page.getByTestId('run-welcome');
    this.startButton         = page.getByRole('button', { name: 'Lancer une partie' });
    this.answerInput         = page.getByPlaceholder('Artiste - Titre');
    this.submitButton        = page.getByRole('button', { name: 'Valider', exact: true });
    this.confirmSubmitButton = page.getByRole('button', { name: 'Valider quand même' });
    this.roundTitle          = page.getByTestId('run-round-title');
    this.totalScore          = page.getByTestId('run-total-score');
    this.position            = page.getByTestId('run-position');
    this.answerCard          = page.getByTestId('run-answer');
    this.withdrawnCard       = page.getByTestId('run-withdrawn');
    this.nextTrackButton     = page.getByTestId('run-next-track');
    this.objectivePoints     = page.getByTestId('run-objective-points');
    this.objectiveBefore     = page.getByTestId('run-objective-before');
    this.roundEnd            = page.getByTestId('run-round-end');
    this.roundEndTitle       = page.getByTestId('run-round-end-title');
    this.objectiveLabel      = page.getByTestId('run-objective-label');
    this.nextRoundButton     = page.getByTestId('run-next-round');
    this.finished            = page.getByTestId('run-finished');
    this.disc                = page.getByTestId('run-disc');
    this.record              = this.finished.getByTestId('run-record');
    this.found               = page.getByTestId('run-found');
    this.roundScores         = page.getByTestId('run-round-scores');
    this.playAgainButton     = page.getByTestId('run-play-again');
    this.resumeButton        = page.getByRole('button', { name: 'Reprendre' });
  }

  /** Connecte la page comme le compte admin des tests, qui a l'accès d'office (hôte de test, `POST /api/e2e/login-as-admin`). */
  async loginAsAdmin(): Promise<void> {
    const res = await this.page.request.post(`${BASE}/api/e2e/login-as-admin`);
    if (!res.ok()) throw new Error(`login-as-admin failed: ${res.status()}`);
  }

  /** Connecte la page comme un compte joueur ordinaire (créé au besoin, `POST /api/auth/dev-login`) et rend son identifiant. */
  async loginAsPlayer(email: string, pseudo: string): Promise<string> {
    const res = await this.page.request.post(`${BASE}/api/auth/dev-login`, { data: { email, pseudo } });
    if (!res.ok()) throw new Error(`dev-login failed: ${res.status()}`);
    const me = await this.page.request.get(`${BASE}/api/players/me`);
    return ((await me.json()) as { playerId: string }).playerId;
  }

  /** Ouvre `/runs` et attend l'accueil du mode (horloge simulée, comme au jeu du jour : la saisie a des minuteries). */
  async open(): Promise<void> {
    await this.page.clock.install({ time: Date.now() });
    await this.page.goto('/runs');
    await this.welcome.waitFor({ state: 'visible' });
  }

  /** `open` puis « Lancer une partie » : le premier morceau part. */
  async launch(): Promise<void> {
    await this.open();
    await this.startButton.click();
    await this.answerInput.waitFor({ state: 'visible' });
  }

  /** Répond « Artiste - Titre » au morceau en cours ; vide : « Valider » puis « Valider quand même » (0 point). */
  async answer(text: string | null): Promise<void> {
    await this.answerInput.waitFor({ state: 'visible' });
    if (text === null) {
      await this.submitButton.click();
      await this.confirmSubmitButton.click();
    } else {
      await this.answerInput.fill(text);
      // La liste de l'autocomplétion se ferme au blur (minuterie de 150 ms) ; Entrée envoie le formulaire sans viser le bouton.
      await this.answerInput.evaluate(el => (el as HTMLElement).blur());
      await this.page.clock.fastForward(200);
      await this.answerInput.press('Enter');
    }
    await this.answerCard.waitFor({ state: 'visible' });
  }

  /** Répond juste à ce morceau, vérifie la carte de réponse, puis « Morceau suivant » (ou « Fin de la manche »). */
  async answerRight(track: RunTrack): Promise<void> {
    await this.answer(`${track.artist} - ${track.title}`);
    await expect(this.answerCard.getByTestId('run-answer-artist-verdict')).toContainText('✓');
    await expect(this.answerCard.getByTestId('run-answer-title-verdict')).toContainText('✓');
    await this.nextTrackButton.click();
  }

  /** Passe ce morceau (réponse vide, 0 point), puis « Morceau suivant » (ou « Fin de la manche »). */
  async answerEmpty(): Promise<void> {
    await this.answer(null);
    await expect(this.answerCard.getByTestId('run-answer-artist-verdict')).toContainText('✗');
    await this.nextTrackButton.click();
  }

  /** Répond juste à tous les morceaux d'une manche, jusqu'à son bilan. */
  async winRound(tracks: RunTrack[], round: number): Promise<void> {
    await expect(this.roundTitle).toHaveText(new RegExp(`Manche ${round} / 4`, 'i'));
    await inSequence(tracks.filter(t => t.round === round), track => this.answerRight(track));
    await expect(this.roundEndTitle).toHaveText(`Manche ${round} terminée`);
  }
}

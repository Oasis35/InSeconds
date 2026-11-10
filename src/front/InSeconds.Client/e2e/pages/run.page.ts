import { Page, Locator, expect } from '@playwright/test';
import { inSequence } from '../fixtures/sequence';
import type { RunTrack } from '../fixtures/api-client';

const BASE = process.env['CI'] ? 'http://localhost:5175' : 'http://localhost:5177';

/**
 * Le mode Run (« Platines », `/runs`) : l'accueil du mode, la partie (la carte du morceau avec son chrono, sa réponse ou le morceau retiré,
 * puis la pile des morceaux joués et des manches passées) et la fin. L'écoute est fixe (10 s) et la saisie est là dès que le son se charge :
 * on répond sans attendre la fin de l'extrait. Les animations coupées, la partie ne s'enchaîne pas seule : « Morceau suivant » à chaque fois.
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
  readonly toGo: Locator;
  readonly clock: Locator;
  readonly pileTracks: Locator;
  readonly paliers: Locator;
  readonly answerCard: Locator;
  readonly withdrawnCard: Locator;
  readonly nextTrackButton: Locator;
  readonly palier: Locator;
  readonly palierNextButton: Locator;
  readonly finished: Locator;
  readonly disc: Locator;
  readonly record: Locator;
  readonly found: Locator;
  readonly roundScores: Locator;
  readonly playAgainButton: Locator;
  readonly resumeButton: Locator;
  readonly linkScreen: Locator;
  readonly linkTitle: Locator;
  readonly linkRules: Locator;
  readonly linkPlayButton: Locator;
  readonly compareButton: Locator;
  readonly toDailyLink: Locator;
  readonly comparison: Locator;
  readonly comparisonEyebrow: Locator;
  readonly comparisonTitle: Locator;
  readonly comparisonRows: Locator;
  readonly statusScreen: Locator;
  readonly roundCards: Locator;
  readonly handCards: Locator;
  readonly cardEffects: Locator;

  constructor(readonly page: Page) {
    this.homeCard            = page.getByTestId('run-home-card');
    this.welcome             = page.getByTestId('run-welcome');
    this.startButton         = page.getByRole('button', { name: 'Lancer une partie' });
    this.answerInput         = page.getByPlaceholder('Artiste - Titre');
    this.submitButton        = page.getByRole('button', { name: 'Valider', exact: true });
    this.confirmSubmitButton = page.getByRole('button', { name: 'Valider quand même' });
    this.roundTitle          = page.getByTestId('run-round-title');
    this.totalScore          = page.getByTestId('run-total-score');
    this.toGo                = page.getByTestId('run-to-go');
    this.clock               = page.getByTestId('run-clock');
    this.pileTracks          = page.getByTestId('run-pile-track');
    this.paliers             = page.getByTestId('run-palier');
    this.answerCard          = page.getByTestId('run-answer');
    this.withdrawnCard       = page.getByTestId('run-withdrawn');
    this.nextTrackButton     = page.getByTestId('run-next-track');
    this.palier              = page.getByTestId('run-palier-screen');
    this.palierNextButton    = page.getByTestId('run-palier-next-button');
    this.finished            = page.getByTestId('run-finished');
    this.disc                = page.getByTestId('run-disc');
    this.record              = this.finished.getByTestId('run-record');
    this.found               = page.getByTestId('run-found');
    this.roundScores         = page.getByTestId('run-round-scores');
    this.playAgainButton     = page.getByTestId('run-play-again');
    this.resumeButton        = page.getByRole('button', { name: 'Reprendre' });
    this.linkScreen          = page.getByTestId('run-link');
    this.linkTitle           = page.getByTestId('run-link-title');
    this.linkRules           = page.getByTestId('run-link-rules');
    this.linkPlayButton      = page.getByTestId('run-link-play');
    this.compareButton       = page.getByTestId('run-compare');
    this.toDailyLink         = page.getByTestId('run-to-daily');
    this.comparison          = page.getByTestId('run-comparison');
    this.roundCards          = page.getByTestId('run-round-cards');
    this.handCards           = this.roundCards.locator('button[data-testid^="run-play-"]');
    this.cardEffects         = page.getByTestId('run-card-effect');
    this.comparisonEyebrow   = page.getByTestId('run-comparison-eyebrow');
    this.comparisonTitle     = page.getByTestId('run-comparison-title');
    this.comparisonRows      = page.locator('[data-testid="run-comparison-table"] tbody tr');
    this.statusScreen        = page.getByTestId('run-status');
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

  /** Ouvre le lien d'une playlist (`/runs/<code>`), horloge simulée comme `open`. */
  async openLink(code: string): Promise<void> {
    await this.page.clock.install({ time: Date.now() });
    await this.page.goto(`/runs/${code}`);
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
      // La souris reste où elle a cliqué (« Morceau suivant ») : si la liste des propositions s'ouvre dessous, le survol en surligne une, et
      // Entrée la choisirait au lieu d'envoyer la saisie (« partie gagnée » ratait ainsi un morceau sur une machine lente). On l'écarte.
      await this.page.mouse.move(0, 0);
      await this.answerInput.fill(text);
      // La liste de l'autocomplétion se ferme au blur (minuterie de 150 ms) ; Entrée envoie le formulaire sans viser le bouton.
      await this.answerInput.evaluate(el => (el as HTMLElement).blur());
      await this.page.clock.fastForward(200);
      await this.answerInput.press('Enter');
    }
    await this.answerCard.waitFor({ state: 'visible' });
  }

  /** Répond juste à ce morceau, vérifie sa réponse dans la carte, puis « Morceau suivant ». */
  async answerRight(track: RunTrack): Promise<void> {
    await this.answer(`${track.artist} - ${track.title}`);
    await expect(this.answerCard.getByTestId('run-answer-artist-verdict')).toContainText('✓');
    await expect(this.answerCard.getByTestId('run-answer-title-verdict')).toContainText('✓');
    await this.nextTrackButton.click();
  }

  /** Passe ce morceau (réponse vide, 0 point), puis « Morceau suivant ». */
  async answerEmpty(): Promise<void> {
    await this.answer(null);
    await expect(this.answerCard.getByTestId('run-answer-artist-verdict')).toContainText('✗');
    await this.nextTrackButton.click();
  }

  /** Rate la première manche (5 réponses vides, 0 point, objectif manqué) : la dernière réponse mène à l'écran de fin d'une partie perdue. */
  async loseFirstRound(afterFirstAnswer?: () => Promise<void>): Promise<void> {
    await this.answerEmpty();
    await afterFirstAnswer?.();
    await inSequence([2, 3, 4], () => this.answerEmpty());
    await this.answer(null);
    await expect(this.nextTrackButton).toHaveText(/Voir le résultat/i);
    await this.nextTrackButton.click();
    await expect(this.finished).toHaveAttribute('data-status', 'lost');
  }

  /**
   * Répond juste à tous les morceaux d'une manche. Sauf à la dernière (qui mène à la fin) : l'écran de palier, ses trois cartes offertes,
   * les trois difficultés sur le même écran (Normal d'abord, ou celle demandée pour la manche suivante), « Jouer », puis la ligne de la manche posée dans la pile.
   */
  async winRound(tracks: RunTrack[], round: number, difficulty: 'easy' | 'safe' | 'risky' = 'safe'): Promise<void> {
    await expect(this.roundTitle).toHaveText(`Manche ${round}`);
    await inSequence(tracks.filter(t => t.round === round), track => this.answerRight(track));
    if (round === 4) return;
    await expect(this.palier).toBeVisible();
    await expect(this.palier.locator('[data-card]')).toHaveCount(3);
    // « Normal » : l'objectif et les points du proto 1 ; « Jouer » lance le premier morceau de la manche.
    await this.page.getByTestId(`run-difficulty-${difficulty}`).click();
    await this.palierNextButton.click();
    await expect(this.paliers).toHaveCount(round);
  }
}

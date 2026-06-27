import { Page, Locator } from '@playwright/test';

export class BlindRoundPage {
  readonly answerInput: Locator;
  readonly submitButton: Locator;
  readonly confirmSubmitButton: Locator;
  readonly clearSearchButton: Locator;
  readonly nextButton: Locator;
  readonly roundScore: Locator;

  constructor(readonly page: Page) {
    this.answerInput         = page.getByPlaceholder('Artiste — Titre');
    this.submitButton        = page.getByRole('button', { name: 'Valider' });
    this.confirmSubmitButton = page.getByRole('button', { name: 'Valider quand même' });
    this.clearSearchButton   = page.getByRole('button', { name: '✕' });
    this.nextButton          = page.getByRole('button', { name: /Piste suivante|Voir le résultat/ });
    // Score affiché dans le résultat du round : "+850 pts"
    this.roundScore          = page.locator('p').filter({ hasText: ' pts' }).last();
  }

  durationButton(seconds: number | string): Locator {
    return this.page.getByRole('button', { name: `${seconds}s` });
  }

  async chooseDuration(seconds: number | string): Promise<void> {
    await this.durationButton(seconds).click();
  }

  /**
   * Advance the fake clock so the audio stop timer fires.
   * Call after chooseDuration() + a short real wait for canplay.
   */
  async advanceClock(durationSeconds: number): Promise<void> {
    await this.page.waitForTimeout(300);
    await this.page.clock.fastForward(durationSeconds * 1000 + 200);
  }

  async waitForAnswerInput(): Promise<void> {
    await this.answerInput.waitFor({ state: 'visible' });
  }

  async typeAnswer(answer: string): Promise<void> {
    await this.answerInput.fill(answer);
    // Déclenche blur pour fermer la dropdown (onBlur a un setTimeout 150ms)
    await this.answerInput.evaluate(el => (el as HTMLElement).blur());
    // Avance la clock pour que le setTimeout(150ms) de onBlur() s'exécute
    await this.page.clock.fastForward(200);
  }

  async submit(): Promise<void> {
    // La suggestion Deezer (réponse asynchrone) peut rouvrir la dropdown autocomplete
    // par-dessus le bouton Valider et intercepter le clic. On soumet donc le formulaire
    // au clavier (Entrée dans le champ) : déclenche ngSubmit de façon déterministe, sans
    // dépendre de la position du bouton ni de l'état de la dropdown.
    await this.answerInput.press('Enter');
  }

  async submitEmpty(): Promise<void> {
    await this.submitButton.click();
    await this.confirmSubmitButton.click();
  }

  async goNext(): Promise<void> {
    await this.nextButton.waitFor({ state: 'visible' });
    await this.nextButton.click();
  }

  /**
   * Full round: choose duration, advance clock, type answer (optional), submit, go next.
   */
  async playRound(durationSeconds: number | string, answer?: string): Promise<void> {
    await this.chooseDuration(durationSeconds);
    await this.advanceClock(Number(durationSeconds));
    await this.waitForAnswerInput();
    if (answer) {
      await this.typeAnswer(answer);
      await this.submit();
    } else {
      await this.submitEmpty();
    }
    await this.goNext();
  }
}

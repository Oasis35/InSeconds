import { Page, Locator } from '@playwright/test';

// Paliers par défaut exposés par les settings (cf. AppSettings.AllowedDurationsSeconds).
// La lecture démarre automatiquement au premier (0.5s) — il n'y a plus de bouton de choix initial.
const ALLOWED_DURATIONS = [0.5, 1, 1.5, 2, 3, 5, 10];

export class BlindRoundPage {
  readonly answerInput: Locator;
  readonly submitButton: Locator;
  readonly confirmSubmitButton: Locator;
  readonly clearSearchButton: Locator;
  readonly nextButton: Locator;
  readonly roundScore: Locator;
  readonly listenMoreButton: Locator;

  constructor(readonly page: Page) {
    this.answerInput         = page.getByPlaceholder('Artiste — Titre');
    this.submitButton        = page.getByRole('button', { name: 'Valider' });
    this.confirmSubmitButton = page.getByRole('button', { name: 'Valider quand même' });
    this.clearSearchButton   = page.getByRole('button', { name: '✕' });
    this.nextButton          = page.getByRole('button', { name: /Piste suivante|Voir le résultat/ });
    // Score affiché dans le résultat du round : "+850 pts"
    this.roundScore          = page.locator('p').filter({ hasText: ' pts' }).last();
    this.listenMoreButton    = page.getByRole('button', { name: /jusqu'à/ });
  }

  /** Bouton « ↺ Xs » (rejoue le palier courant en entier) — visible une fois le palier terminé. */
  replayButton(seconds: number | string): Locator {
    return this.page.getByRole('button', { name: `↺ ${seconds}s` });
  }

  /**
   * La lecture démarre automatiquement au premier palier autorisé (0.5s).
   * Fait avancer l'horloge pour laisser ce premier segment se terminer.
   */
  async waitForAutoStart(): Promise<void> {
    await this.page.waitForTimeout(300);
    await this.page.clock.fastForward(ALLOWED_DURATIONS[0] * 1000 + 200);
  }

  /**
   * Prolonge l'écoute jusqu'au palier `targetSeconds` en cliquant « écouter plus »
   * palier par palier (chaînage, comme le ferait un joueur).
   *
   * Chaque clic est fait une fois le palier précédent *terminé* (état 'finished'),
   * jamais pendant la lecture : AudioPlayerService.extend() a un comportement dual
   * (cf. audio-player.service.ts) — en 'playing' il calcule le temps restant à partir
   * de audio.currentTime (horloge *réelle* du média, non simulée par page.clock), ce
   * qui désynchronise la fake clock sous charge (E2E réel avec vraie lecture audio).
   * En 'finished', il relit depuis 0 et programme l'arrêt via setTimeout — entièrement
   * piloté par la fake clock, donc déterministe.
   */
  async listenUpTo(targetSeconds: number): Promise<void> {
    const targetIdx = ALLOWED_DURATIONS.indexOf(targetSeconds);
    if (targetIdx < 0) throw new Error(`Palier inconnu : ${targetSeconds}`);

    for (let i = 1; i <= targetIdx; i++) {
      // Palier précédent déjà en 'finished' à ce stade (auto-start ou itération précédente).
      await this.listenMoreButton.click();
      await this.page.waitForTimeout(300);
      await this.page.clock.fastForward(ALLOWED_DURATIONS[i] * 1000 + 200);
    }
  }

  /**
   * Démarre l'écoute (auto-play au 1er palier) puis prolonge jusqu'à `durationSeconds`.
   * Remplace l'ancien choix manuel de palier.
   */
  async chooseDuration(durationSeconds: number): Promise<void> {
    await this.waitForAutoStart();
    if (durationSeconds !== ALLOWED_DURATIONS[0]) {
      await this.listenUpTo(durationSeconds);
    }
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
   * Full round: play up to duration (auto-start + extend if needed), type answer (optional), submit, go next.
   */
  async playRound(durationSeconds: number, answer?: string): Promise<void> {
    await this.chooseDuration(durationSeconds);
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

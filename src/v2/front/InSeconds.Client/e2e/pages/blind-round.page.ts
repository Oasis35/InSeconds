import { Page, Locator, expect } from '@playwright/test';
import { inSequence } from '../fixtures/sequence';

// Paliers par défaut exposés par les settings (cf. AppSettings.AllowedDurationsSeconds).
// La lecture démarre automatiquement au premier (0.5s) — il n'y a plus de bouton de choix initial. Howler joue chaque palier comme un segment
// décodé en mémoire : le navigateur s'arrête lui-même au palier, seul l'événement de fin passe par un setTimeout, que l'horloge simulée avance.
const ALLOWED_DURATIONS = [0.5, 1, 1.5, 2, 3, 5, 10];

export class BlindRoundPage {
  readonly answerInput: Locator;
  readonly submitButton: Locator;
  readonly confirmSubmitButton: Locator;
  readonly clearSearchButton: Locator;
  readonly nextButton: Locator;
  readonly roundScore: Locator;
  readonly listenMoreButton: Locator;
  readonly guessTimeChart: Locator;
  readonly guessTimeBars: Locator;
  readonly guessTimeHighlighted: Locator;
  /** Le chrono du lecteur : « … » pendant le chargement, « 0.0s / 0.5s » en lecture, « 0.5s / 0.5s » une fois le palier joué. */
  readonly timer: Locator;

  constructor(readonly page: Page) {
    this.answerInput         = page.getByPlaceholder('Artiste — Titre');
    this.submitButton        = page.getByRole('button', { name: 'Valider' });
    this.confirmSubmitButton = page.getByRole('button', { name: 'Valider quand même' });
    this.clearSearchButton   = page.getByRole('button', { name: '✕' });
    this.nextButton          = page.getByRole('button', { name: /Piste suivante|Voir le résultat/ });
    // Score affiché dans le résultat du round : "+850 pts"
    this.roundScore          = page.locator('p').filter({ hasText: ' pts' }).last();
    // Bouton "écouter plus" : texte visible "+X" (ex: "+1", "+1.5"), tooltip "jusqu'à Xs" en title uniquement.
    this.listenMoreButton    = page.getByRole('button', { name: /^▶ \d/ });
    // Histogramme "en combien de temps les autres ont trouvé" affiché à la révélation.
    this.guessTimeChart       = page.getByTestId('guess-time-chart');
    this.guessTimeBars        = this.guessTimeChart.locator('[data-bucket]');
    this.guessTimeHighlighted = this.guessTimeChart.locator('[data-highlight="true"]');
    this.timer                = page.getByTestId('round-timer');
  }

  /** Bouton « ↺ Xs » (rejoue le palier courant en entier) — visible une fois le palier terminé. */
  replayButton(seconds: number | string): Locator {
    return this.page.getByRole('button', { name: `↺ ${seconds}s` });
  }

  /**
   * Attend que le palier `seconds` soit joué en entier. Le son se charge en vrai (un extrait décodé en mémoire), puis part : le chrono quitte
   * « … ». Le navigateur joue le segment, dont seul l'événement de fin dépend d'un setTimeout : on fait avancer l'horloge simulée une fois la
   * lecture partie, puis on attend « Ns / Ns » (palier joué).
   */
  private async playStep(seconds: number): Promise<void> {
    await expect(this.timer).toHaveText(new RegExp(String.raw`s / ${seconds}s\s*$`));
    await this.page.clock.fastForward(seconds * 1000 + 200);
    await expect(this.timer).toHaveText(`${seconds}s / ${seconds}s`);
  }

  /** La lecture démarre automatiquement au premier palier autorisé (0.5s) : on la laisse aller au bout. */
  async waitForAutoStart(): Promise<void> {
    await this.playStep(ALLOWED_DURATIONS[0]);
  }

  /**
   * Prolonge l'écoute jusqu'au palier `targetSeconds` en cliquant « écouter plus » palier par palier, chaque clic une fois le palier
   * précédent joué (comme le ferait un joueur).
   */
  async listenUpTo(targetSeconds: number): Promise<void> {
    const targetIdx = ALLOWED_DURATIONS.indexOf(targetSeconds);
    if (targetIdx < 0) throw new Error(`Palier inconnu : ${targetSeconds}`);

    await inSequence(ALLOWED_DURATIONS.slice(1, targetIdx + 1), async (duration) => {
      await this.listenMoreButton.click();
      await this.playStep(duration);
    });
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

  /**
   * Tape le déclencheur `dedup-test` du FakeDeezerHandler (back, mode Testing) : 3 variantes
   * parenthésées du même morceau + un morceau distinct, soit 2 suggestions une fois nettoyées.
   */
  async showDedupSuggestions(): Promise<Locator> {
    await this.answerInput.fill('dedup-test');
    // Déclenche le debounce 300ms de DeezerAutocompleteService (RxJS, soumis à la fake clock) ;
    // la requête HTTP réelle qui suit revient en temps réel.
    await this.page.clock.fastForward(350);
    const suggestions = this.page.getByRole('option');
    await expect(suggestions).toHaveCount(2);
    return suggestions;
  }

  /** Attend l'écran de résultat du morceau et renvoie les points marqués. */
  async readRoundScore(): Promise<number> {
    await this.nextButton.waitFor({ state: 'visible' });
    const text = await this.roundScore.textContent();
    return Number.parseInt(text?.replaceAll(/\D/g, '') ?? '0', 10);
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

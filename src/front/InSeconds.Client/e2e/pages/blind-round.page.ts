import { Page, Locator, expect } from '@playwright/test';
import { inSequence } from '../fixtures/sequence';

// Paliers par défaut exposés par les settings (cf. AppSettings.AllowedDurationsSeconds).
// La lecture démarre automatiquement au premier (0.5s) - il n'y a plus de bouton de choix initial. Le lecteur s'arrête quand la
// position réelle de l'extrait atteint le palier (le son joue en temps réel) ; son chrono de secours passe par setTimeout, que l'horloge simulée avance.
const ALLOWED_DURATIONS = [0.5, 1, 1.5, 2, 3, 5, 10];

export class BlindRoundPage {
  readonly answerInput: Locator;
  readonly submitButton: Locator;
  readonly confirmSubmitButton: Locator;
  readonly clearSearchButton: Locator;
  readonly nextButton: Locator;
  readonly roundScore: Locator;
  /** Le total de la partie, sous les points du morceau à la révélation (il n'est plus dans l'en-tête). */
  readonly roundTotal: Locator;
  /** Les points en jeu, à gauche du bouton du lecteur. */
  readonly stake: Locator;
  readonly listenMoreButton: Locator;
  readonly guessTimeChart: Locator;
  readonly guessTimeBars: Locator;
  readonly guessTimeHighlighted: Locator;
  /**
   * Le temps écouté, lu par les lecteurs d'écran (le lecteur ne l'affiche plus, la waveform le montre) : « … » pendant le chargement,
   * « 0,0 s / 0,5 s » en lecture, « 0,5 s / 0,5 s » une fois le palier joué.
   */
  readonly timer: Locator;

  constructor(readonly page: Page) {
    this.answerInput         = page.getByPlaceholder('Artiste - Titre');
    this.submitButton        = page.getByRole('button', { name: 'Valider' });
    this.confirmSubmitButton = page.getByRole('button', { name: 'Valider quand même' });
    this.clearSearchButton   = page.getByRole('button', { name: '✕' });
    this.nextButton          = page.getByRole('button', { name: /Piste suivante|Voir le résultat/ });
    // Score affiché dans le résultat du round : "+850 pts"
    this.roundScore          = page.getByTestId('round-score');
    this.roundTotal          = page.getByTestId('round-total');
    this.stake               = page.getByTestId('round-stake');
    // Bouton rond « écouter plus » : texte visible « ▶ 1,5 s », tooltip « Écouter jusqu'à 1,5 s » en title.
    this.listenMoreButton    = page.getByRole('button', { name: /^▶ \d/ });
    // Histogramme "en combien de temps les autres ont trouvé" affiché à la révélation.
    this.guessTimeChart       = page.getByTestId('guess-time-chart');
    this.guessTimeBars        = this.guessTimeChart.locator('[data-bucket]');
    this.guessTimeHighlighted = this.guessTimeChart.locator('[data-highlight="true"]');
    this.timer                = page.getByTestId('round-timer');
  }

  /** Bouton « ↺ X s » (rejoue le palier courant en entier) - visible une fois le palier terminé. */
  replayButton(seconds: number | string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^↺ ${frSeconds(seconds)}$`) });
  }

  /**
   * Attend que le palier `seconds` soit joué en entier. Le son se charge en vrai, puis part : le chrono quitte « … ». Le lecteur
   * s'arrête quand la position réelle de l'extrait atteint le palier : le son joue en temps réel, l'horloge simulée n'y change rien
   * (on l'avance quand même pour les minuteries de l'écran). L'attente couvre donc le palier entier, plus la marge habituelle.
   */
  private async playStep(seconds: number): Promise<void> {
    await expect(this.timer).toHaveText(new RegExp(String.raw`s / ${frSeconds(seconds)}\s*$`));
    await this.page.clock.fastForward(seconds * 1000 + 200);
    await expect(this.timer).toHaveText(new RegExp(String.raw`^\s*${frSeconds(seconds)} / ${frSeconds(seconds)}\s*$`), { timeout: seconds * 1000 + 10_000 });
  }

  /** La lecture démarre automatiquement au premier palier autorisé (0,5 s) : on la laisse aller au bout. */
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

/** Un palier tel que l'écran l'écrit en français, en motif : « 0,5 s » (virgule, espace insécable avant l'unité). */
function frSeconds(seconds: number | string): string {
  return String.raw`${String(seconds).replace('.', ',')}\ss`;
}

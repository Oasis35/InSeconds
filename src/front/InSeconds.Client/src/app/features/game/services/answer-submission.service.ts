import { Injectable, OnDestroy, signal } from '@angular/core';
import { SubmitAnswerResponse } from '../../../core/models/game.models';
import { countUp } from '../../../core/count-up';

/**
 * État d'affichage du résultat de soumission (score animé, toast erreur réseau) + la
 * confirmation inline « réponse vide ». Extrait de `BlindRoundComponent` pour SRP (même
 * pattern que `HintService`/`AnswerSearchService`). Le replay audio après révélation reste
 * dans le composant (a besoin de `track()`/`chosenDuration()`), tout comme l'orchestration
 * `submit()`/`confirmSubmit()`/`doSubmit()` (émet l'output `answered`).
 */
@Injectable()
export class AnswerSubmissionService implements OnDestroy {
  readonly result = signal<SubmitAnswerResponse | null>(null);
  readonly showEmptyConfirm = signal(false);
  readonly isSubmitting = signal(false);
  readonly displayedScore = signal(0);
  readonly showNetworkError = signal(false);

  private networkErrorTimer: ReturnType<typeof setTimeout> | null = null;

  setResult(r: SubmitAnswerResponse, isNetworkError = false): void {
    this.isSubmitting.set(false);
    this.result.set(r);
    this.displayedScore.set(0);
    countUp(r.score, v => this.displayedScore.set(v));
    if (isNetworkError) {
      this.showNetworkError.set(true);
      if (this.networkErrorTimer) clearTimeout(this.networkErrorTimer);
      this.networkErrorTimer = setTimeout(() => {
        this.showNetworkError.set(false);
        this.networkErrorTimer = null;
      }, 4000);
    }
  }

  /** Réinitialisation à chaque changement de morceau — appelé depuis `BlindRoundComponent.next()`. */
  reset(): void {
    this.result.set(null);
    this.displayedScore.set(0);
    this.isSubmitting.set(false);
    this.showNetworkError.set(false);
    if (this.networkErrorTimer) { clearTimeout(this.networkErrorTimer); this.networkErrorTimer = null; }
  }

  ngOnDestroy(): void {
    if (this.networkErrorTimer) { clearTimeout(this.networkErrorTimer); this.networkErrorTimer = null; }
  }
}

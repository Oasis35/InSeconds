import { Injectable, signal } from '@angular/core';
import { SubmitAnswerResponse } from '../../../core/models/game.models';
import { countUp } from '../../../core/count-up';

/**
 * État d'affichage du résultat de soumission (score animé) + la confirmation inline commune
 * « réponse vide » / « Passer » + l'échec d'envoi (`submitFailed`, cf. piège E5 CLAUDE.md :
 * sur erreur réseau définitive — après les tentatives automatiques de `GameService.submitAnswer`
 * — le joueur reste bloqué sur le morceau avec un bouton « Réessayer » plutôt que de continuer
 * avec un faux résultat à 0, qui empêchait la partie de se terminer côté serveur). Extrait de
 * `BlindRoundComponent` pour SRP (même pattern que `HintService`/`AnswerSearchService`). Le
 * replay audio après révélation reste dans le composant (a besoin de `track()`/`chosenDuration()`),
 * tout comme l'orchestration `submit()`/`confirmPending()`/`doSubmit()` (émet l'output `answered`).
 */
export type PendingConfirm = 'empty' | 'skip' | null;

@Injectable()
export class AnswerSubmissionService {
  readonly result = signal<SubmitAnswerResponse | null>(null);
  /** Confirmation inline en attente : réponse vide envoyée (`empty`) ou bouton « Passer » (`skip`). */
  readonly pendingConfirm = signal<PendingConfirm>(null);
  readonly isSubmitting = signal(false);
  readonly displayedScore = signal(0);
  /** La soumission (avec ses tentatives automatiques) a définitivement échoué — bloque la progression. */
  readonly submitFailed = signal(false);

  setResult(r: SubmitAnswerResponse): void {
    this.isSubmitting.set(false);
    this.submitFailed.set(false);
    this.result.set(r);
    this.displayedScore.set(0);
    countUp(r.score, v => this.displayedScore.set(v));
  }

  /** La soumission a échoué après les tentatives automatiques — le joueur peut réessayer. */
  setError(): void {
    this.isSubmitting.set(false);
    this.submitFailed.set(true);
  }

  /** Réinitialisation à chaque changement de morceau — appelé depuis `BlindRoundComponent.next()`. */
  reset(): void {
    this.result.set(null);
    this.pendingConfirm.set(null);
    this.displayedScore.set(0);
    this.isSubmitting.set(false);
    this.submitFailed.set(false);
  }
}

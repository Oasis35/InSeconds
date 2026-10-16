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
  private readonly _result = signal<SubmitAnswerResponse | null>(null);
  readonly result = this._result.asReadonly();
  /** Confirmation inline en attente : réponse vide envoyée (`empty`) ou bouton « Passer » (`skip`). */
  private readonly _pendingConfirm = signal<PendingConfirm>(null);
  readonly pendingConfirm = this._pendingConfirm.asReadonly();
  private readonly _isSubmitting = signal(false);
  readonly isSubmitting = this._isSubmitting.asReadonly();
  private readonly _displayedScore = signal(0);
  readonly displayedScore = this._displayedScore.asReadonly();
  /** La soumission (avec ses tentatives automatiques) a définitivement échoué — bloque la progression. */
  private readonly _submitFailed = signal(false);
  readonly submitFailed = this._submitFailed.asReadonly();

  setResult(r: SubmitAnswerResponse): void {
    this._isSubmitting.set(false);
    this._submitFailed.set(false);
    this._result.set(r);
    this._displayedScore.set(0);
    countUp(r.score, v => this._displayedScore.set(v));
  }

  /** Ouvre la confirmation inline (réponse vide ou « Passer »), ou la referme avec `null`. */
  setPendingConfirm(kind: PendingConfirm): void {
    this._pendingConfirm.set(kind);
  }

  /** Envoi (ou renvoi) de la réponse en cours. */
  startSubmitting(): void {
    this._isSubmitting.set(true);
    this._submitFailed.set(false);
  }

  /** La soumission a échoué après les tentatives automatiques — le joueur peut réessayer. */
  setError(): void {
    this._isSubmitting.set(false);
    this._submitFailed.set(true);
  }

  /** Réinitialisation à chaque changement de morceau — appelé depuis `BlindRoundComponent.next()`. */
  reset(): void {
    this._result.set(null);
    this._pendingConfirm.set(null);
    this._displayedScore.set(0);
    this._isSubmitting.set(false);
    this._submitFailed.set(false);
  }
}

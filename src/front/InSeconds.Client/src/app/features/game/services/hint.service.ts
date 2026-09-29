import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameFacadeService } from './game-facade.service';

/**
 * État de la demande/révélation des indices (cf. Common/Scoring/RequestHint côté back).
 * Contenu révélé au clic, jamais automatiquement en atteignant un palier — extrait de
 * `BlindRoundComponent` pour SRP. Le déblocage par palier (`hint1Unlocked` etc., dépendant
 * de `chosenDuration`, état de lecture du round) reste dans le composant : ce service ne
 * porte que l'appel réseau et ce qui a déjà été révélé.
 */
@Injectable()
export class HintService {
  private readonly gameService = inject(GameFacadeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _hint1Revealed = signal(false);
  readonly hint1Revealed = this._hint1Revealed.asReadonly();
  private readonly _hint2Revealed = signal(false);
  readonly hint2Revealed = this._hint2Revealed.asReadonly();
  private readonly _hintYear = signal<number | null>(null);
  readonly hintYear = this._hintYear.asReadonly();
  private readonly _hintArtistMasked = signal<string | null>(null);
  readonly hintArtistMasked = this._hintArtistMasked.asReadonly();
  private readonly _hintRequestPending = signal(false);
  readonly hintRequestPending = this._hintRequestPending.asReadonly();

  useHint1(sessionId: number, trackId: number): void {
    if (this.hintRequestPending() || this.hint1Revealed()) return;
    this._hintRequestPending.set(true);
    this.gameService.requestHint(sessionId, trackId, 1)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          this._hintYear.set(r.year ?? null);
          this._hint1Revealed.set(true);
          this._hintRequestPending.set(false);
        },
        error: () => this._hintRequestPending.set(false),
      });
  }

  useHint2(sessionId: number, trackId: number): void {
    if (this.hintRequestPending() || this.hint2Revealed()) return;
    this._hintRequestPending.set(true);
    this.gameService.requestHint(sessionId, trackId, 2)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          // Cumulatif : le niveau 2 renvoie aussi l'année, que le niveau 1 ait été
          // révélé séparément avant ou non.
          this._hintYear.set(r.year ?? null);
          this._hintArtistMasked.set(r.artistMasked ?? null);
          this._hint1Revealed.set(true);
          this._hint2Revealed.set(true);
          this._hintRequestPending.set(false);
        },
        error: () => this._hintRequestPending.set(false),
      });
  }

  /** Réinitialisation à chaque changement de morceau — appelé depuis `BlindRoundComponent.next()`. */
  reset(): void {
    this._hint1Revealed.set(false);
    this._hint2Revealed.set(false);
    this._hintYear.set(null);
    this._hintArtistMasked.set(null);
    this._hintRequestPending.set(false);
  }
}

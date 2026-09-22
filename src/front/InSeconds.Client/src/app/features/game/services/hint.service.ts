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

  readonly hint1Revealed = signal(false);
  readonly hint2Revealed = signal(false);
  readonly hintYear = signal<number | null>(null);
  readonly hintArtistMasked = signal<string | null>(null);
  readonly hintRequestPending = signal(false);

  useHint1(sessionId: number, trackId: number): void {
    if (this.hintRequestPending() || this.hint1Revealed()) return;
    this.hintRequestPending.set(true);
    this.gameService.requestHint(sessionId, trackId, 1)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          this.hintYear.set(r.year ?? null);
          this.hint1Revealed.set(true);
          this.hintRequestPending.set(false);
        },
        error: () => this.hintRequestPending.set(false),
      });
  }

  useHint2(sessionId: number, trackId: number): void {
    if (this.hintRequestPending() || this.hint2Revealed()) return;
    this.hintRequestPending.set(true);
    this.gameService.requestHint(sessionId, trackId, 2)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          // Cumulatif : le niveau 2 renvoie aussi l'année, que le niveau 1 ait été
          // révélé séparément avant ou non.
          this.hintYear.set(r.year ?? null);
          this.hintArtistMasked.set(r.artistMasked ?? null);
          this.hint1Revealed.set(true);
          this.hint2Revealed.set(true);
          this.hintRequestPending.set(false);
        },
        error: () => this.hintRequestPending.set(false),
      });
  }

  /** Réinitialisation à chaque changement de morceau — appelé depuis `BlindRoundComponent.next()`. */
  reset(): void {
    this.hint1Revealed.set(false);
    this.hint2Revealed.set(false);
    this.hintYear.set(null);
    this.hintArtistMasked.set(null);
    this.hintRequestPending.set(false);
  }
}

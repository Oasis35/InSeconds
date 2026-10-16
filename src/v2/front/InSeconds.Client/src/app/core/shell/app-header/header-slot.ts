import { Injectable, computed, signal } from '@angular/core';

/**
 * Dit à l'en-tête global (`<app-header>`) qu'une page affiche son propre en-tête : le jeu du jour pose la gélule de série et le lien de compte
 * (`<app-account-link>`) dans son bandeau IN//SECONDS, et l'en-tête global s'efface tant qu'elle est affichée. `core` ne connaît aucun domaine :
 * la page prend la place en arrivant et la rend en partant.
 */
@Injectable({ providedIn: 'root' })
export class HeaderSlot {
  private readonly owners = signal<readonly object[]>([]);
  /** Vrai tant qu'une page affiche son propre en-tête. */
  readonly takenOver = computed(() => this.owners().length > 0);

  takeOver(owner: object): void {
    if (!this.owners().includes(owner)) this.owners.update(owners => [...owners, owner]);
  }

  /** Ne rend que la place de l'appelant (une autre page a pu la prendre entre-temps). */
  release(owner: object): void {
    this.owners.update(owners => owners.filter(o => o !== owner));
  }
}

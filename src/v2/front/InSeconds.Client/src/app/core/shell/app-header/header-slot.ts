import { Injectable, TemplateRef, signal } from '@angular/core';

/**
 * L'emplacement de gauche de l'en-tête (`<app-header>`), que la page courante remplit : la gélule de série (et gels) du jeu du jour, ou le score
 * en cours de partie. L'en-tête est posé une fois pour toute l'app, et `core` ne connaît aucun domaine : la page lui donne son gabarit, rendu à
 * sa place, et le retire en partant.
 */
@Injectable({ providedIn: 'root' })
export class HeaderSlot {
  private readonly _left = signal<TemplateRef<unknown> | null>(null);
  readonly left = this._left.asReadonly();

  show(template: TemplateRef<unknown>): void {
    this._left.set(template);
  }

  /** Retire le gabarit s'il est toujours celui de l'appelant (une autre page a pu en poser un autre entre-temps). */
  clear(template: TemplateRef<unknown>): void {
    if (this._left() === template) this._left.set(null);
  }
}

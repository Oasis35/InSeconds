import { Injectable, Injector, inject } from '@angular/core';
import { ComponentType, createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

export interface ModalOptions<D> {
  data?: D;
  /** Largeur maximale de la fenêtre (CSS). */
  maxWidth?: string;
  /** Empêche la fermeture par Échap et par le fond (étape qui doit aller au bout). */
  disableClose?: boolean;
  /**
   * Injecteur de la fenêtre. Sans lui, elle ne voit que les services de la racine : pour qu'elle
   * retrouve ceux de la page qui l'ouvre (un store fourni par la route), passer l'injecteur de la page.
   */
  injector?: Injector;
}

/**
 * Ouvre les fenêtres de l'app avec le CDK Dialog (§ 6.1 du plan v2) : piège du focus, Échap, fond
 * cliquable, retour du focus à l'élément d'origine et `role="dialog"` viennent de la bibliothèque,
 * plus du code maison. Deux présentations :
 * - `open` : modale centrée ;
 * - `openSheet` : panneau bas (série, confirmations en cours de partie).
 * Le contenu utilise `<app-modal-frame>` pour le titre et le bouton de fermeture.
 */
@Injectable({ providedIn: 'root' })
export class ModalService {
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);

  open<R, D = unknown, C = unknown>(component: ComponentType<C>, options: ModalOptions<D> = {}): DialogRef<R, C> {
    return this.dialog.open<R, D, C>(component, {
      data: options.data,
      disableClose: options.disableClose ?? false,
      injector: options.injector,
      maxWidth: options.maxWidth ?? '24rem',
      width: 'calc(100% - 2rem)',
      panelClass: 'app-modal-panel',
      backdropClass: 'app-modal-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      ariaModal: true,
    });
  }

  openSheet<R, D = unknown, C = unknown>(component: ComponentType<C>, options: ModalOptions<D> = {}): DialogRef<R, C> {
    return this.dialog.open<R, D, C>(component, {
      data: options.data,
      disableClose: options.disableClose ?? false,
      injector: options.injector,
      maxWidth: options.maxWidth ?? '32rem',
      width: '100%',
      panelClass: 'app-sheet-panel',
      backdropClass: 'app-modal-backdrop',
      positionStrategy: createGlobalPositionStrategy(this.injector).centerHorizontally().bottom('0'),
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      ariaModal: true,
    });
  }

  /** Demande une confirmation dans un panneau bas ; `false` si le joueur ferme sans choisir. */
  async confirm(data: ConfirmDialogData): Promise<boolean> {
    const ref = this.openSheet<boolean, ConfirmDialogData, ConfirmDialogComponent>(ConfirmDialogComponent, { data });
    return (await firstValueFrom(ref.closed)) === true;
  }
}

import { DialogRef } from '@angular/cdk/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../ui/modal/confirm-dialog.component';
import { ModalService } from '../../ui/modal/modal.service';

/**
 * La confirmation de sortie d'une partie en cours, commune aux modes : une fenêtre dont le bouton de confirmation laisse partir
 * (« Quitter quand même ») et l'annulation, qui a le focus, garde le joueur dans la manche (« Continuer à jouer »).
 */
export class LeaveGuard {
  private dialog: DialogRef<boolean, ConfirmDialogComponent> | null = null;

  constructor(private readonly modal: ModalService) {}

  /** Ouvre la fenêtre (en fermant une précédente, sans laisser partir) ; rend `true` si le joueur confirme la sortie. */
  confirm(data: ConfirmDialogData): Promise<boolean> {
    this.dialog?.close(false);
    const dialog = this.modal.openSheet<boolean, ConfirmDialogData, ConfirmDialogComponent>(ConfirmDialogComponent, { data });
    this.dialog = dialog;
    return new Promise<boolean>(resolve =>
      dialog.closed.subscribe(result => {
        if (this.dialog === dialog) this.dialog = null;
        resolve(result === true);
      }));
  }

  /** Il n'y a plus de partie à protéger : une fenêtre ouverte se ferme en laissant partir. */
  release(): void {
    this.dialog?.close(true);
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { CdkDialogContainer, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';

/**
 * Données de la fenêtre : le nombre de parties déjà arrondi (`null` : le message sans chiffre), la langue de son écriture, et ce que fait
 * « Défie un ami ». Celui-ci est appelé dans le clic même : le menu de partage du téléphone exige un geste du joueur.
 */
export interface ThanksDialogData {
  games: number | null;
  lang: string;
  challenge: () => void;
}

/**
 * Le message de remerciement (signé Clément), dans un panneau bas, écrit comme une lettre : aligné à gauche, sans effet. Présentationnel :
 * la page décide quand l'ouvrir (une fois par navigateur, après une partie) et ce que fait « Défie un ami ». « Continuer », la croix, Échap
 * et le fond la ferment.
 */
@Component({
  selector: 'app-thanks-dialog',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './thanks-dialog.component.html',
})
export class ThanksDialogComponent {
  private readonly ref = inject(DialogRef);
  private readonly data = inject<ThanksDialogData>(DIALOG_DATA);
  /** « 2 550 » en français, « 2,550 » en anglais. */
  protected readonly games = this.data.games === null ? null : new Intl.NumberFormat(this.data.lang).format(this.data.games);
  protected readonly titleId = 'app-thanks-title';

  constructor() {
    // Relie la fenêtre à son titre (aria-labelledby), comme `<app-modal-frame>`.
    const container = this.ref.containerInstance;
    const destroyRef = inject(DestroyRef);
    if (container instanceof CdkDialogContainer) {
      container._addAriaLabelledBy(this.titleId);
      destroyRef.onDestroy(() => container._removeAriaLabelledBy(this.titleId));
    }
  }

  protected challenge(): void {
    this.data.challenge();
    this.ref.close();
  }

  protected close(): void {
    this.ref.close();
  }
}

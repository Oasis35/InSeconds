import { Component, ElementRef, effect, inject, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { FormField, FormRoot } from '@angular/forms/signals';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalComponent } from '../../../../shared/modal/modal.component';
import { AdminPoolService } from '../../services/admin-pool.service';

@Component({
  selector: 'app-edit-track-modal',
  imports: [ModalComponent, FormField, FormRoot, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-track-modal.component.html',
})
export class EditTrackModalComponent {
  protected readonly pool = inject(AdminPoolService);

  private readonly artistInput = viewChild<ElementRef<HTMLInputElement>>('artistInput');

  constructor() {
    // Focus sur le champ Artiste à l'ouverture : saisie directe au clavier.
    effect(() => this.artistInput()?.nativeElement.focus());
  }
}
